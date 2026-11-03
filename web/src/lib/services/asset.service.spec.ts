import { getAssetInfo, updateAsset, type AssetResponseDto } from '@immich/sdk';
import { toastManager } from '@immich/ui';
import { vitest } from 'vitest';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { getAssetActions, handleDownloadAsset } from '$lib/services/asset.service';
import { setSharedLink } from '$lib/utils';
import { handleError } from '$lib/utils/handle-error';
import { getFormatter } from '$lib/utils/i18n';
import { assetFactory } from '@test-data/factories/asset-factory';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { sharedLinkFactory } from '@test-data/factories/shared-link-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';

vitest.mock('@immich/ui', () => ({
  toastManager: {
    primary: vitest.fn(),
    info: vitest.fn(),
  },
}));

vitest.mock('$lib/utils/i18n', () => ({
  getFormatter: vitest.fn(),
  getPreferredLocale: vitest.fn(),
}));

vitest.mock('@immich/sdk');
vitest.mock('$lib/utils/handle-error', () => ({ handleError: vitest.fn() }));

vitest.mock('$lib/utils', async () => {
  const originalModule = await vitest.importActual('$lib/utils');
  return {
    ...originalModule,
    sleep: vitest.fn(),
  };
});

vi.mock(import('$lib/managers/feature-flags-manager.svelte'), function () {
  return {
    featureFlagsManager: { init: vi.fn(), loadFeatureFlags: vi.fn(), value: {} } as never,
  };
});

describe('AssetService', () => {
  describe('getAssetActions', () => {
    beforeEach(() => {
      authManager.setPreferences(preferencesFactory.build());
    });

    it('should allow shared link downloads if the user owns the asset and shared link downloads are disabled', () => {
      const ownerId = 'owner';
      const user = userAdminFactory.build({ id: ownerId });
      const asset = assetFactory.build({ ownerId });
      authManager.setUser(user);
      setSharedLink(sharedLinkFactory.build({ allowDownload: false }));
      const assetActions = getAssetActions(() => '', asset);
      expect(assetActions.SharedLinkDownload.$if?.()).toStrictEqual(true);
    });

    it('should not allow shared link downloads if the user does not own the asset and shared link downloads are disabled', () => {
      const ownerId = 'owner';
      const user = userAdminFactory.build({ id: 'non-owner' });
      const asset = assetFactory.build({ ownerId });
      authManager.setUser(user);
      setSharedLink(sharedLinkFactory.build({ allowDownload: false }));
      const assetActions = getAssetActions(() => '', asset);
      expect(assetActions.SharedLinkDownload.$if?.()).toStrictEqual(false);
    });

    it('should allow shared link downloads if shared link downloads are enabled regardless of user', () => {
      const asset = assetFactory.build();
      setSharedLink(sharedLinkFactory.build({ allowDownload: true }));
      const assetActions = getAssetActions(() => '', asset);
      expect(assetActions.SharedLinkDownload.$if?.()).toStrictEqual(true);
    });
  });

  describe('rating shortcuts', () => {
    beforeEach(() => {
      vitest.clearAllMocks();
      authManager.setPreferences(preferencesFactory.build());
      vitest.mocked(getFormatter).mockResolvedValue((key) => String(key));
      vitest.spyOn(eventManager, 'emit');
    });

    afterEach(() => {
      vitest.restoreAllMocks();
    });

    const press = (asset: AssetResponseDto, key: string, onRated = vitest.fn(), repeat = false) => {
      const { Rate } = getAssetActions(() => '', asset, undefined, onRated);
      return Rate.onAction({ action: Rate, event: new KeyboardEvent('keydown', { key, repeat }) });
    };

    it.each([1, 2, 3, 4, 5])('saves %i stars before requesting the next asset', async (rating) => {
      const asset = assetFactory.build();
      const response = { ...asset, exifInfo: { rating } };
      let resolve!: (value: AssetResponseDto) => void;
      vitest.mocked(updateAsset).mockReturnValue(new Promise((done) => (resolve = done)));
      const onRated = vitest.fn();

      const saving = press(asset, String(rating), onRated);
      await vitest.waitFor(() => expect(updateAsset).toHaveBeenCalledOnce());
      expect(onRated).not.toHaveBeenCalled();
      expect(updateAsset).toHaveBeenCalledWith({ id: asset.id, updateAssetDto: { rating } });
      resolve(response);
      await saving;

      expect(eventManager.emit).toHaveBeenCalledWith('AssetUpdate', response);
      expect(onRated).toHaveBeenCalledExactlyOnceWith(asset.id);
    });

    it('does not advance if saving fails and allows retrying', async () => {
      const asset = assetFactory.build();
      const onRated = vitest.fn();
      const error = new Error('Save failed');
      vitest.mocked(updateAsset).mockRejectedValueOnce(error).mockResolvedValueOnce(asset);

      await press(asset, '3', onRated);
      expect(handleError).toHaveBeenCalledWith(error, 'errors.unable_to_set_rating');
      expect(onRated).not.toHaveBeenCalled();
      await press(asset, '3', onRated);
      expect(onRated).toHaveBeenCalledExactlyOnceWith(asset.id);
    });

    it('advances without another save when the requested rating is already assigned', async () => {
      const asset = assetFactory.build({ exifInfo: { rating: 4 } });
      const onRated = vitest.fn();

      await press(asset, '4', onRated);

      expect(updateAsset).not.toHaveBeenCalled();
      expect(onRated).toHaveBeenCalledExactlyOnceWith(asset.id);
    });

    it('clears the rating with zero without advancing', async () => {
      const asset = assetFactory.build();
      const onRated = vitest.fn();
      vitest.mocked(updateAsset).mockResolvedValue(asset);

      await press(asset, '0', onRated);

      expect(updateAsset).toHaveBeenCalledWith({ id: asset.id, updateAssetDto: { rating: null } });
      expect(onRated).not.toHaveBeenCalled();
    });

    it('ignores keyboard auto-repeat', async () => {
      const asset = assetFactory.build();
      const onRated = vitest.fn();

      await press(asset, '2', onRated, true);

      expect(updateAsset).not.toHaveBeenCalled();
      expect(onRated).not.toHaveBeenCalled();
    });

    it('ignores additional rating requests while the current save is pending', async () => {
      const asset = assetFactory.build();
      const onRated = vitest.fn();
      let resolve!: (value: AssetResponseDto) => void;
      vitest.mocked(updateAsset).mockReturnValue(new Promise((done) => (resolve = done)));

      const saving = press(asset, '2', onRated);
      await vitest.waitFor(() => expect(updateAsset).toHaveBeenCalledOnce());
      await press(asset, '5', onRated);
      expect(updateAsset).toHaveBeenCalledOnce();
      resolve(asset);
      await saving;
      expect(onRated).toHaveBeenCalledExactlyOnceWith(asset.id);
    });

    it('does not rate or advance when invoked without a number shortcut', async () => {
      const asset = assetFactory.build();
      const onRated = vitest.fn();
      const { Rate } = getAssetActions(() => '', asset, undefined, onRated);

      await Rate.onAction({ action: Rate, event: new MouseEvent('click') });

      expect(updateAsset).not.toHaveBeenCalled();
      expect(onRated).not.toHaveBeenCalled();
      expect(toastManager.info).toHaveBeenCalledWith('rate_asset_description');
    });
  });

  describe('handleDownloadAsset', () => {
    it('should use the asset originalFileName when showing toasts', async () => {
      const $t = vitest.fn().mockReturnValue('formatter');
      vitest.mocked(getFormatter).mockResolvedValue($t);
      const asset = assetFactory.build({ originalFileName: 'asset.heic' });
      await handleDownloadAsset(asset, { edited: false });
      expect($t).toHaveBeenNthCalledWith(1, 'downloading_asset_filename', { values: { filename: 'asset.heic' } });
      expect(toastManager.primary).toHaveBeenCalledWith('formatter');
    });

    it('should use the motion asset originalFileName when showing toasts', async () => {
      const $t = vitest.fn().mockReturnValue('formatter');
      vitest.mocked(getFormatter).mockResolvedValue($t);
      const motionAsset = assetFactory.build({ originalFileName: 'asset.mov' });
      vitest.mocked(getAssetInfo).mockResolvedValue(motionAsset);
      const asset = assetFactory.build({ originalFileName: 'asset.heic', livePhotoVideoId: '1' });
      await handleDownloadAsset(asset, { edited: false });
      expect($t).toHaveBeenNthCalledWith(1, 'downloading_asset_filename', { values: { filename: 'asset.heic' } });
      expect($t).toHaveBeenNthCalledWith(2, 'downloading_asset_filename', { values: { filename: 'asset-motion.mov' } });
      expect(toastManager.primary).toHaveBeenCalledWith('formatter');
    });
  });
});
