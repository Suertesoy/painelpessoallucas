import { describe, it, expect } from 'vitest';
import { LearningCommands } from '@/modules/learning/application/learning.commands';
import { LearningQueries } from '@/modules/learning/application/learning.queries';
import {
  FakeLearningContentRepository,
  FakeStudySessionRepository,
  FakeLessonProgressRepository,
  FakeEventRepository,
} from './learning-fakes';

/**
 * Cobre o percurso Hiragana (Fase 3 do módulo Aprendizado): as 19 lições
 * novas + as 2 existentes precisam somar 21, na ordem certa, cada uma com
 * `contentKey` estável e conteúdo válido pelo schema — e a reconciliação do
 * seed continua sendo por `contentKey`, nunca por `title`, preservando `id`
 * e progresso existente ao reparar conteúdo divergente.
 */

const WORKSPACE_A = 'c5be4f82-e8c9-403f-a495-59e2d5838d50';

const EXPECTED_FUNDAMENTOS_CONTENT_KEYS = [
  'introducao-ao-curso',
  'hiragana-vogais',
  'hiragana-linha-k',
  'hiragana-linha-s',
  'hiragana-revisao-1',
  'hiragana-linha-t',
  'hiragana-linha-n',
  'hiragana-linha-h',
  'hiragana-revisao-2',
  'hiragana-linha-m',
  'hiragana-linha-y',
  'hiragana-linha-r',
  'hiragana-linha-w-n',
  'hiragana-revisao-3',
  'hiragana-dakuten-g-z',
  'hiragana-dakuten-d-b-p',
  'hiragana-sons-combinados',
  'hiragana-tsu-pequeno',
  'hiragana-vogais-longas',
  'hiragana-leitura-inicial',
  'hiragana-revisao-final',
];

function setup() {
  const contentRepo = new FakeLearningContentRepository();
  const sessionRepo = new FakeStudySessionRepository();
  const progressRepo = new FakeLessonProgressRepository();
  const eventRepo = new FakeEventRepository();
  const commands = new LearningCommands(contentRepo, sessionRepo, eventRepo, progressRepo);
  const queries = new LearningQueries(contentRepo, sessionRepo, progressRepo);
  return { commands, queries, contentRepo, progressRepo, eventRepo };
}

async function seedFundamentos(commands: LearningCommands, contentRepo: FakeLearningContentRepository) {
  const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
  const modules = await contentRepo.listModulesByCourse(course.id);
  const fundamentos = modules.find((m) => m.title === 'Fundamentos')!;
  const lessons = (await contentRepo.listLessonsByModule(fundamentos.id)).slice().sort((a, b) => a.position - b.position);
  return { course, fundamentos, lessons };
}

describe('Percurso Hiragana — criação e ordem das lições', () => {
  it('cria as 21 lições do módulo Fundamentos (2 da Fase 2 + 19 novas)', async () => {
    const { commands, contentRepo } = setup();
    const { fundamentos, lessons } = await seedFundamentos(commands, contentRepo);

    expect(lessons).toHaveLength(21);
    expect(fundamentos.lessonsCount).toBe(21);
  });

  it('mantém a ordem e o contentKey exatos definidos no seed', async () => {
    const { commands, contentRepo } = setup();
    const { lessons } = await seedFundamentos(commands, contentRepo);

    expect(lessons.map((l) => l.contentKey)).toEqual(EXPECTED_FUNDAMENTOS_CONTENT_KEYS);
    lessons.forEach((lesson, index) => expect(lesson.position).toBe(index));
  });

  it('todo contentKey é kebab-case e único dentro do módulo', async () => {
    const { commands, contentRepo } = setup();
    const { lessons } = await seedFundamentos(commands, contentRepo);

    const keys = lessons.map((l) => l.contentKey);
    keys.forEach((key) => expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('nenhuma lição fica sem objective inicial nem summary final', async () => {
    const { commands, contentRepo } = setup();
    const { lessons } = await seedFundamentos(commands, contentRepo);

    lessons.forEach((lesson) => {
      expect(lesson.content.blocks[0]?.type).toBe('objective');
      expect(lesson.content.blocks[lesson.content.blocks.length - 1]?.type).toBe('summary');
    });
  });

  it('todo blockId é único dentro de cada lição', async () => {
    const { commands, contentRepo } = setup();
    const { lessons } = await seedFundamentos(commands, contentRepo);

    lessons.forEach((lesson) => {
      const ids = lesson.content.blocks.map((b) => b.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  it('todo bloco multiple_choice tem correctOptionId referenciando uma opção existente', async () => {
    const { commands, contentRepo } = setup();
    const { lessons } = await seedFundamentos(commands, contentRepo);

    lessons.forEach((lesson) => {
      lesson.content.blocks
        .filter((b) => b.type === 'multiple_choice')
        .forEach((b) => {
          if (b.type !== 'multiple_choice') return;
          const optionIds = b.options.map((o) => o.id);
          expect(new Set(optionIds).size).toBe(optionIds.length);
          expect(optionIds).toContain(b.correctOptionId);
        });
    });
  });

  it('lições de revisão não introduzem nenhum bloco kana novo', async () => {
    const { commands, contentRepo } = setup();
    const { lessons } = await seedFundamentos(commands, contentRepo);

    const revisionKeys = ['hiragana-revisao-1', 'hiragana-revisao-2', 'hiragana-revisao-3', 'hiragana-revisao-final'];
    lessons
      .filter((l) => revisionKeys.includes(l.contentKey))
      .forEach((lesson) => {
        expect(lesson.content.blocks.some((b) => b.type === 'kana')).toBe(false);
      });
  });

  it('seed é idempotente: rodar duas vezes não duplica lições nem muda a contagem', async () => {
    const { commands, contentRepo } = setup();
    await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const { fundamentos, lessons } = await seedFundamentos(commands, contentRepo);

    expect(lessons).toHaveLength(21);
    expect(fundamentos.lessonsCount).toBe(21);
  });
});

describe('Percurso Hiragana — reconciliação por contentKey preserva id e progresso', () => {
  it('título divergente é reparado pelo seed, mas o id da lição não muda', async () => {
    const { commands, contentRepo } = setup();
    const { lessons } = await seedFundamentos(commands, contentRepo);
    const linhaK = lessons.find((l) => l.contentKey === 'hiragana-linha-k')!;

    // Simula uma edição manual (ex.: direto no banco) que divergiu do seed.
    await contentRepo.saveLessons([{ ...linhaK, title: 'Título Errado', updatedAt: linhaK.updatedAt }]);

    await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const repaired = await contentRepo.findLessonById(linhaK.id);

    expect(repaired?.id).toBe(linhaK.id);
    expect(repaired?.title).toBe('Hiragana — Linha K');
    expect(repaired?.contentKey).toBe('hiragana-linha-k');
  });

  it('progresso existente sobrevive a uma correção de conteúdo pelo seed (mesmo lessonId)', async () => {
    const { commands, contentRepo, progressRepo } = setup();
    const { course, fundamentos, lessons } = await seedFundamentos(commands, contentRepo);
    const linhaS = lessons.find((l) => l.contentKey === 'hiragana-linha-s')!;

    const progress = await commands.recordLessonViewed(WORKSPACE_A, {
      courseId: course.id,
      moduleId: fundamentos.id,
      lessonId: linhaS.id,
    });

    // Diverge o título salvo — o próximo seed precisa reparar sem afetar o progresso.
    await contentRepo.saveLessons([{ ...linhaS, title: 'Divergente', updatedAt: linhaS.updatedAt }]);
    await commands.initializeDefaultLearningContent(WORKSPACE_A);

    const stillThere = await progressRepo.findByLesson(WORKSPACE_A, linhaS.id);
    expect(stillThere?.id).toBe(progress.id);
    expect(stillThere?.status).toBe('in_progress');
  });

  it('uma lição com título igual ao de outra, mas contentKey diferente, nunca é fundida (reconciliação nunca é por título)', async () => {
    const { commands, contentRepo } = setup();
    const { fundamentos, lessons } = await seedFundamentos(commands, contentRepo);
    const linhaK = lessons.find((l) => l.contentKey === 'hiragana-linha-k')!;

    // Lição "estranha" com o MESMO título de uma lição real, mas contentKey
    // diferente — o seed nunca deve confundi-la com hiragana-linha-k.
    await contentRepo.saveLessons([
      {
        id: '99999999-9999-4999-8999-999999999998',
        workspaceId: WORKSPACE_A,
        moduleId: fundamentos.id,
        contentKey: 'licao-manual-teste',
        title: linhaK.title,
        position: 99,
        content: linhaK.content,
        createdAt: linhaK.createdAt,
        updatedAt: linhaK.updatedAt,
      },
    ]);

    await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const allLessons = await contentRepo.listLessonsByModule(fundamentos.id);

    expect(allLessons).toHaveLength(22); // 21 do seed + a lição manual, nunca fundidas
    expect(allLessons.find((l) => l.contentKey === 'licao-manual-teste')).toBeDefined();
    expect(allLessons.find((l) => l.contentKey === 'hiragana-linha-k')?.id).toBe(linhaK.id);
  });
});

describe('Percurso Hiragana — isolamento por workspace', () => {
  it('lições semeadas em um workspace não aparecem para outro', async () => {
    const { commands, contentRepo } = setup();
    const contentRepoB = new FakeLearningContentRepository();
    const sessionRepoB = new FakeStudySessionRepository();
    const progressRepoB = new FakeLessonProgressRepository();
    const eventRepoB = new FakeEventRepository();
    const commandsB = new LearningCommands(contentRepoB, sessionRepoB, eventRepoB, progressRepoB);

    const { lessons: lessonsA } = await seedFundamentos(commands, contentRepo);
    const { lessons: lessonsB } = await seedFundamentos(commandsB, contentRepoB);

    expect(lessonsB).toHaveLength(21);
    // Workspaces distintos nunca compartilham a mesma linha de lição.
    const idsA = new Set(lessonsA.map((l) => l.id));
    const idsB = new Set(lessonsB.map((l) => l.id));
    expect([...idsA].some((id) => idsB.has(id))).toBe(false);
  });
});
