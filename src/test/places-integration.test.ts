// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Busca de locais (Places API New) — server-only, chave nunca chega ao
 * cliente. Sem chave configurada, degrada para lista vazia (nunca lança —
 * a busca de local é conveniência, não pode travar a criação do evento).
 */
vi.mock('server-only', () => ({}));

beforeEach(() => {
  vi.resetModules();
  delete process.env.GOOGLE_PLACES_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchPlaces', () => {
  it('sem chave configurada, retorna lista vazia sem chamar a rede', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { searchPlaces } = await import('@/platform/integrations/places');
    const result = await searchPlaces('Av. Paulista');
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('com chave configurada, mapeia as sugestões da Places API', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'key-teste';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          suggestions: [{ placePrediction: { placeId: 'place-1', text: { text: 'Av. Paulista, 1000' } } }],
        }),
      })
    );
    const { searchPlaces } = await import('@/platform/integrations/places');
    const result = await searchPlaces('Av. Paulista');
    expect(result).toEqual([{ placeId: 'place-1', text: 'Av. Paulista, 1000' }]);
  });

  it('falha da Places API não lança — retorna lista vazia', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'key-teste';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { searchPlaces } = await import('@/platform/integrations/places');
    await expect(searchPlaces('Av. Paulista')).resolves.toEqual([]);
  });
});

describe('getPlaceDetails', () => {
  it('sem chave configurada, retorna null', async () => {
    const { getPlaceDetails } = await import('@/platform/integrations/places');
    expect(await getPlaceDetails('place-1')).toBeNull();
  });

  it('com chave configurada, retorna nome/endereço/coordenadas', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'key-teste';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'place-1',
          displayName: { text: 'Escritório' },
          formattedAddress: 'Av. Paulista, 1000 - São Paulo',
          location: { latitude: -23.56, longitude: -46.65 },
        }),
      })
    );
    const { getPlaceDetails } = await import('@/platform/integrations/places');
    const result = await getPlaceDetails('place-1');
    expect(result).toEqual({
      placeId: 'place-1',
      name: 'Escritório',
      formattedAddress: 'Av. Paulista, 1000 - São Paulo',
      lat: -23.56,
      lng: -46.65,
    });
  });
});
