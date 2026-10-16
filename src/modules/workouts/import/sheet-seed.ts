/**
 * Dados brutos da planilha "Treino Marcio Seco 2.xlsx" (Google Drive de
 * Lucas; há uma cópia em Google Sheets compartilhada por Matheus com o mesmo
 * conteúdo). Cada célula está TRANSCRITA como na planilha — nenhuma conversão
 * acontece aqui; o parser decide o que é inequívoco e o que fica sinalizado.
 *
 * Colunas lidas: exercício · descanso · séries×reps · carga Mat · carga Lu(cas).
 * Em alguns dias a planilha inverte a ordem "descanso" e "séries×reps" (dia B);
 * a transcrição abaixo já normaliza essa ordem sem alterar o texto das células.
 *
 * Divergências conhecidas (ver docs/NOSSA_CASA_ESTUDOS_TREINOS.md):
 * - Dia D: o cabeçalho das duas colunas de carga é só "Carga" (sem Mat/Lu).
 *   Assumir a mesma ordem dos outros dias seria inferência — por isso as
 *   cargas do dia D NÃO são importadas como definitivas (`loadsLabeled: false`).
 * - Marcador "X" na coluna à esquerda do nome em 4 exercícios: significado
 *   não documentado.
 */

export interface SheetRow {
  name: string;
  /** Marcador "X" da planilha, se houver. */
  marker?: 'X';
  rest: string;
  setsReps: string;
  /** Carga na coluna "Mat" (Matheus). */
  mat?: string;
  /** Carga na coluna "Lu"/"Lucas". */
  lu?: string;
}

export interface SheetDay {
  code: 'A' | 'B' | 'C' | 'D' | 'E';
  /** false = as colunas de carga não têm cabeçalho Mat/Lu nesta aba. */
  loadsLabeled: boolean;
  rows: SheetRow[];
}

export const SHEET_NAME = 'Treino Marcio Seco 2.xlsx';

export const SHEET_DAYS: SheetDay[] = [
  {
    code: 'A',
    loadsLabeled: true,
    rows: [
      { name: 'Cadeira adutora', rest: '45-60', setsReps: '2x12-15', mat: '50', lu: '43' },
      { name: 'Agachamento livre/hack', rest: '3min', setsReps: '4x6-10', mat: '30', lu: '25' },
      { name: 'Leg 45', rest: '2min', setsReps: '3x10-12', mat: '70', lu: '70' },
      { name: 'Afundo', rest: '90', setsReps: '3x10-12 (cada perna)', mat: '8', lu: '5' },
      { name: 'Extensora', rest: '90', setsReps: '3x12-15', mat: '43', lu: '43' },
      { name: 'Flexão nórdica reversa', rest: '90', setsReps: '3x10-15' },
      { name: 'Panturrilha em pé', rest: '60', setsReps: '4x10-15', mat: '14', lu: '16' },
    ],
  },
  {
    code: 'B',
    loadsLabeled: true,
    rows: [
      { name: 'Peckdeck', rest: '60-90 seg', setsReps: '2x15', mat: '30', lu: '25' },
      { name: 'Supino reto', rest: '2-3min', setsReps: '3x6-10', mat: '25', lu: '25' },
      { name: 'Supino Inclinado halteres', rest: '2 min', setsReps: '3x8-12', mat: '20', lu: '16' },
      { name: 'Cruxifixo reto halter', rest: '60 seg', setsReps: '3x12-15', mat: '12', lu: '8' },
      { name: 'Pullover', rest: '60 seg', setsReps: '2x10-12', mat: '16', lu: '16' },
      { name: 'Supino fechado cross', marker: 'X', rest: '60 seg', setsReps: '3x10-12', mat: '20', lu: '20' },
      { name: 'Elevação Lateral', rest: '60 seg', setsReps: '3x12-15', mat: '7', lu: '6' },
      { name: 'Abdominal', rest: '', setsReps: '10min' },
    ],
  },
  {
    code: 'C',
    loadsLabeled: true,
    rows: [
      { name: 'Remada baixa fechada', rest: '2 mim', setsReps: '3x8-12', mat: '50' },
      { name: 'Remada alta com banco na polia', rest: '2 min', setsReps: '3x10-12', mat: '50', lu: '40' },
      { name: 'Serrote polia baixo', rest: '90 seg', setsReps: '2x10-12', mat: '20', lu: '40' },
      { name: 'Puxada pronada', rest: '90 seg', setsReps: '3x8-12', mat: '45', lu: '40' },
      { name: 'Puxada supinada', marker: 'X', rest: '90 seg', setsReps: '3x10-12', mat: '40', lu: '40' },
      { name: 'Puxada neutra fechada', rest: '90 seg', setsReps: '2x10-12', mat: '50' },
      { name: 'Crucifixo inverso', rest: '90 seg', setsReps: '3x12-15' },
    ],
  },
  {
    code: 'D',
    loadsLabeled: false,
    rows: [
      { name: 'Triceps - barra reta polia alta', rest: '90 seg', setsReps: '3x10-12', mat: '45', lu: '45' },
      { name: 'Frances corda', rest: '90 seg', setsReps: '3x10-12', mat: '25', lu: '25' },
      { name: 'Isolado polia alta', marker: 'X', rest: '90 seg', setsReps: '3x12-15', mat: '10', lu: '10' },
      { name: 'Biceps - rosca direta halteres', rest: '90 seg', setsReps: '3x8-10', mat: '10', lu: '10' },
      { name: 'Rosca Isolado banco', rest: '90 seg', setsReps: '3x10-12', mat: '10', lu: '10' },
      { name: 'Rosca Inversa', marker: 'X', rest: '90 seg', setsReps: '3x12-15', mat: '15', lu: '25' },
      { name: 'Ombro - desenvolvimento maquina', rest: '90 seg', setsReps: '3x8-10', mat: '5' },
      { name: 'Elevação Lateral na Polia', rest: '90 seg', setsReps: '3x12-15', mat: '15' },
      { name: 'Posterior maquina/polia', rest: '90 seg', setsReps: '2x12-15' },
    ],
  },
  {
    code: 'E',
    loadsLabeled: true,
    rows: [
      { name: 'Cadeira Abdutora', rest: '45-60', setsReps: '2x15', mat: '57', lu: '57' },
      { name: 'Terra Sumo', rest: '3min', setsReps: '3x6-8', mat: '30', lu: '25' },
      { name: 'Stiff', rest: '2 min', setsReps: '3x8-10', mat: '20x20', lu: '20x20' },
      { name: 'Bulgaro', rest: '90', setsReps: '2x10-12', mat: '10', lu: '5' },
      { name: 'Cadeira flexora', rest: '90', setsReps: '3x10-15', mat: '43' },
      { name: 'Flexão nórdica', rest: '2', setsReps: '3x8-10', mat: '50' },
      { name: 'Panturrilha em pé', rest: '60', setsReps: '3x10-15 (2s topo, 2s exc)' },
    ],
  },
];
