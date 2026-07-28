import 'server-only';

/**
 * Busca de locais (Places API New, do Google) — exclusivamente servidor.
 *
 * Decisão de arquitetura: em vez de carregar o SDK do Google Maps no
 * navegador (bundle grande, exige chave NEXT_PUBLIC restrita por domínio),
 * a busca passa por uma rota de servidor que chama a Places API via REST
 * com uma chave só de servidor (GOOGLE_PLACES_API_KEY, nunca NEXT_PUBLIC).
 * Reaproveita o mesmo padrão de google-client.ts (fetch autenticado,
 * server-only, chave nunca chega ao cliente).
 *
 * Configuração necessária (documentar, nunca commitar o valor):
 * - GOOGLE_PLACES_API_KEY: chave restrita, no Google Cloud Console, a
 *   "Places API (New)" apenas (Autocomplete (New) + Place Details (New)).
 */

const PLACES_API = 'https://places.googleapis.com/v1';

export interface PlaceSuggestion {
  placeId: string;
  text: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat?: number;
  lng?: number;
}

function getApiKey(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY ?? null;
}

export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const apiKey = getApiKey();
  if (!apiKey || !query.trim()) return [];

  const res = await fetch(`${PLACES_API}/places:autocomplete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
    },
    body: JSON.stringify({
      input: query.trim(),
      languageCode: 'pt-BR',
      regionCode: 'BR',
    }),
  });
  if (!res.ok) {
    console.error('Falha na busca de locais (Places API)', res.status);
    return [];
  }
  const json = (await res.json()) as {
    suggestions?: { placePrediction?: { placeId: string; text?: { text: string } } }[];
  };
  return (json.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is { placeId: string; text?: { text: string } } => !!p?.placeId)
    .map((p) => ({ placeId: p.placeId, text: p.text?.text ?? '' }));
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const apiKey = getApiKey();
  if (!apiKey || !placeId.trim()) return null;

  const res = await fetch(`${PLACES_API}/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
    },
  });
  if (!res.ok) {
    console.error('Falha ao obter detalhes do local (Places API)', res.status);
    return null;
  }
  const json = (await res.json()) as {
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  };
  return {
    placeId: json.id,
    name: json.displayName?.text ?? '',
    formattedAddress: json.formattedAddress ?? '',
    lat: json.location?.latitude,
    lng: json.location?.longitude,
  };
}
