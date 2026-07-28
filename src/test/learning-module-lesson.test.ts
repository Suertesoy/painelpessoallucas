import { describe, it, expect } from 'vitest';
import { moduleHref, type LearningModule } from '@/modules/learning/domain/learning.schema';
import { LearningCommands } from '@/modules/learning/application/learning.commands';
import { LearningQueries } from '@/modules/learning/application/learning.queries';
import {
  FakeLearningContentRepository,
  FakeStudySessionRepository,
  FakeEventRepository,
} from './learning-fakes';

const WORKSPACE_A = 'c5be4f82-e8c9-403f-a495-59e2d5838d50';
const WORKSPACE_B = '8d2facfc-27bf-4736-97c9-b30e70fecfb6';
const COURSE_ID = 'a00df540-da81-4195-af8e-9b0e1115bc03';

function baseModule(overrides: Partial<LearningModule> = {}): LearningModule {
  return {
    id: '74ca335a-3d5e-4297-81fe-c4bba627b51b',
    workspaceId: WORKSPACE_A,
    courseId: COURSE_ID,
    title: 'Fundamentos',
    position: 0,
    status: 'available',
    lessonsCount: 1,
    createdAt: '2026-07-28T11:00:00.000Z',
    updatedAt: '2026-07-28T11:00:00.000Z',
    ...overrides,
  };
}

describe('moduleHref — navegabilidade do módulo', () => {
  it('módulo disponível gera um link navegável', () => {
    const mod = baseModule({ status: 'available' });
    expect(moduleHref(COURSE_ID, mod)).toBe(`/aprendizado/${COURSE_ID}/modulos/${mod.id}`);
  });

  it('módulo em andamento também gera link navegável', () => {
    const mod = baseModule({ status: 'in_progress' });
    expect(moduleHref(COURSE_ID, mod)).not.toBeNull();
  });

  it('módulo concluído também gera link navegável', () => {
    const mod = baseModule({ status: 'completed' });
    expect(moduleHref(COURSE_ID, mod)).not.toBeNull();
  });

  it('módulo bloqueado não gera link (null)', () => {
    const mod = baseModule({ status: 'locked' });
    expect(moduleHref(COURSE_ID, mod)).toBeNull();
  });
});

function setup() {
  const contentRepo = new FakeLearningContentRepository();
  const sessionRepo = new FakeStudySessionRepository();
  const eventRepo = new FakeEventRepository();
  const commands = new LearningCommands(contentRepo, sessionRepo, eventRepo);
  const queries = new LearningQueries(contentRepo, sessionRepo);
  return { commands, queries, contentRepo };
}

describe('Rota do módulo — curso/módulo inexistente', () => {
  it('getCourseById retorna null para curso inexistente', async () => {
    const { queries } = setup();
    expect(await queries.getCourseById('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('getModuleById retorna null para módulo inexistente', async () => {
    const { queries } = setup();
    expect(await queries.getModuleById('00000000-0000-4000-8000-000000000001')).toBeNull();
  });

  it('listLessonsByModule retorna lista vazia (estado honesto) para módulo sem lições', async () => {
    const { commands, queries, contentRepo } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const modules = await contentRepo.listModulesByCourse(course.id);
    const gramatica = modules.find((m) => m.title === 'Gramática')!;

    expect(await queries.listLessonsByModule(gramatica.id)).toEqual([]);
  });
});

describe('Isolamento entre workspaces — acesso a módulo de outro workspace', () => {
  it('módulo de um workspace não é encontrado pelo repositório de outro workspace', async () => {
    const { commands, contentRepo } = setup();
    const contentRepoB = new FakeLearningContentRepository();
    const sessionRepoB = new FakeStudySessionRepository();
    const eventRepoB = new FakeEventRepository();
    const commandsB = new LearningCommands(contentRepoB, sessionRepoB, eventRepoB);
    const queriesB = new LearningQueries(contentRepoB, sessionRepoB);

    const courseA = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    await commandsB.initializeDefaultLearningContent(WORKSPACE_B);

    const modulesA = await contentRepo.listModulesByCourse(courseA.id);
    const fundamentosA = modulesA.find((m) => m.title === 'Fundamentos')!;

    // O repositório do workspace B (equivalente a um cliente Supabase filtrado
    // por RLS) nunca teve esse módulo — deve retornar null, nunca vazar dados.
    expect(await queriesB.getModuleById(fundamentosA.id)).toBeNull();
  });
});
