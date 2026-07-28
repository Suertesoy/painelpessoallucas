'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';

export interface SelectedLocation {
  name: string;
  formattedAddress: string;
  placeId?: string;
  lat?: number;
  lng?: number;
}

interface PlaceSuggestion {
  placeId: string;
  text: string;
}

/**
 * Busca de estabelecimento/endereço com sugestões reais (Places API, via
 * rota de servidor — ver platform/integrations/places.ts). `onSelect` só
 * recebe um valor quando o usuário escolhe uma sugestão da lista; texto
 * digitado sem selecionar nada chama `onSelect(null)` — a diferença entre
 * "local validado" e "texto sem validação" precisa ficar explícita para
 * quem consome este componente.
 */
export function LocationSearch({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (text: string) => void;
  onSelect: (location: SelectedLocation | null) => void;
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const query = value.trim();
    debounceRef.current = setTimeout(() => {
      if (query.length < 3) {
        setSuggestions([]);
        return;
      }
      setIsSearching(true);
      fetch(`/api/integrations/places/search?q=${encodeURIComponent(query)}`)
        .then((res) => (res.ok ? res.json() : { suggestions: [] }))
        .then((body: { suggestions?: PlaceSuggestion[] }) => {
          setSuggestions(body.suggestions ?? []);
          setIsOpen(true);
        })
        .catch(() => setSuggestions([]))
        .finally(() => setIsSearching(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const handlePick = async (suggestion: PlaceSuggestion) => {
    setIsOpen(false);
    setSuggestions([]);
    onChange(suggestion.text);
    try {
      const res = await fetch(`/api/integrations/places/details?placeId=${encodeURIComponent(suggestion.placeId)}`);
      if (!res.ok) {
        onSelect({ name: suggestion.text, formattedAddress: suggestion.text, placeId: suggestion.placeId });
        return;
      }
      const details = (await res.json()) as {
        placeId: string;
        name: string;
        formattedAddress: string;
        lat?: number;
        lng?: number;
      };
      onChange(details.formattedAddress || suggestion.text);
      onSelect({
        name: details.name || suggestion.text,
        formattedAddress: details.formattedAddress || suggestion.text,
        placeId: details.placeId,
        lat: details.lat,
        lng: details.lng,
      });
    } catch {
      onSelect({ name: suggestion.text, formattedAddress: suggestion.text, placeId: suggestion.placeId });
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onSelect(null);
        }}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        placeholder="Buscar estabelecimento ou endereço…"
        className="w-full rounded border p-1.5 text-xs outline-none"
        aria-label="Local do evento"
      />
      {isSearching && <Loader2 size={12} className="pointer-events-none absolute right-2 top-2 animate-spin text-gray-400" />}
      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded border bg-white text-xs shadow-lg">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void handlePick(s)}
                className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-gray-50"
              >
                <MapPin size={12} className="shrink-0 text-gray-400" /> {s.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
