import { AssetTypeEnum } from '@immich/sdk';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import SearchRatingsSection from '$lib/components/shared-components/search-bar/SearchRatingsSection.svelte';
import { searchManager } from '$lib/managers/search-manager.svelte';

describe('SearchRatingsSection component', () => {
  beforeEach(() => {
    searchManager.reset();
  });

  afterEach(() => {
    searchManager.reset();
  });

  it('does not select unstarred when no rating filter is set', () => {
    render(SearchRatingsSection);

    expect(screen.getByRole('button', { name: 'unstarred' })).toHaveAttribute('aria-pressed', 'false');
    expect(searchManager.filter.rating).toBeUndefined();
  });

  it('sets rating to null without changing other search filters', async () => {
    const user = userEvent.setup();
    searchManager.setQuery({ rating: 3, country: 'Hungary', type: AssetTypeEnum.Image, isFavorite: true });
    render(SearchRatingsSection);

    await user.click(screen.getByRole('button', { name: 'unstarred' }));

    expect(searchManager.filter.rating).toBeNull();
    expect(searchManager.filter.location.country).toBe('Hungary');
    expect(searchManager.filter.display.isFavorite).toBe(true);
    expect(screen.getByRole('button', { name: 'unstarred' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '★★★' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('recognizes an existing unrated search and toggles it off', async () => {
    const user = userEvent.setup();
    searchManager.setQuery({ rating: null });
    render(SearchRatingsSection);
    const button = screen.getByRole('button', { name: 'unstarred' });

    expect(button).toHaveAttribute('aria-pressed', 'true');
    await user.click(button);

    expect(searchManager.filter.rating).toBeUndefined();
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('replaces the unstarred filter with a star rating', async () => {
    const user = userEvent.setup();
    searchManager.setQuery({ rating: null });
    render(SearchRatingsSection);

    await user.click(screen.getByRole('button', { name: '★★★★★' }));

    expect(searchManager.filter.rating).toBe(5);
    expect(screen.getByRole('button', { name: 'unstarred' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '★★★★★' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('still clears a selected star rating on a second click', async () => {
    const user = userEvent.setup();
    searchManager.setQuery({ rating: 1 });
    render(SearchRatingsSection);

    await user.click(screen.getByRole('button', { name: '★' }));

    expect(searchManager.filter.rating).toBeUndefined();
  });
});
