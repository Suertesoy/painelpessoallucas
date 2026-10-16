// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { isCourseVisibleTo } from '@/modules/learning/domain/learning.schema';
import { LearningCommands } from '@/modules/learning/application/learning.commands';
import { RegisterMovementButton } from '@/components/finance-cash/register-movement';
import {
  FakeLearningContentRepository,
  FakeStudySessionRepository,
  FakeLessonProgressRepository,
  FakeEventRepository,
} from './learning-fakes';

afterEach(cleanup);

const WS = 'c5be4f82-e8c9-403f-a495-59e2d5838d50';
const LUCAS = '11111111-1111-4111-8111-111111111111';
const MATHEUS = '22222222-2222-4222-8222-222222222222';

describe('cursos individuais no workspace compartilhado', () => {
  it('curso sem dono é do administrador; curso com dono é só do dono', () => {
    expect(isCourseVisibleTo({}, { userId: LUCAS, isOwner: true })).toBe(true);
    expect(isCourseVisibleTo({}, { userId: MATHEUS, isOwner: false })).toBe(false);
    expect(isCourseVisibleTo({ ownerUserId: MATHEUS }, { userId: MATHEUS, isOwner: false })).toBe(true);
    expect(isCourseVisibleTo({ ownerUserId: MATHEUS }, { userId: LUCAS, isOwner: true })).toBe(false);
  });

  function commandsFor(viewer: { userId: string; isOwner: boolean } | null, content = new FakeLearningContentRepository()) {
    content.getViewer = async () => viewer;
    return {
      content,
      commands: new LearningCommands(content, new FakeStudySessionRepository(), new FakeEventRepository(), new FakeLessonProgressRepository()),
    };
  }

  it('quem administra cria o Japonês com seu nome como dono', async () => {
    const { commands } = commandsFor({ userId: LUCAS, isOwner: true });
    const course = await commands.initializeDefaultLearningContent(WS);
    expect(course.ownerUserId).toBe(LUCAS);
  });

  it('Matheus (não administrador) NÃO cria nem recebe o Japonês do Lucas', async () => {
    const { commands, content } = commandsFor({ userId: MATHEUS, isOwner: false });
    await expect(commands.initializeDefaultLearningContent(WS)).rejects.toThrow(/outra pessoa da casa/);
    expect(content.courses.size).toBe(0);
  });

  it('sem informação de usuário (testes/legado) o comportamento anterior é mantido', async () => {
    const { commands } = commandsFor(null);
    const course = await commands.initializeDefaultLearningContent(WS);
    expect(course.ownerUserId).toBeUndefined();
  });
});

describe('Registrar movimentação (ponto único)', () => {
  it('oferece as quatro opções e diz o efeito de cada uma no saldo', () => {
    render(
      <RegisterMovementButton categories={[]} persistedCategories expenses={[]} rules={[]} currentMonth="2026-10" />
    );
    fireEvent.click(screen.getByRole('button', { name: /Registrar movimentação/ }));
    const options = screen.getByRole('list', { name: /Tipo de movimentação/ });
    const text = options.textContent ?? '';
    for (const t of ['Entrada pontual', 'Saída pontual', 'Entrada recorrente', 'Conta ou compromisso']) expect(text).toContain(t);
    expect(text).toMatch(/Só soma ao saldo quando você marcar/);
    expect(text).toMatch(/abate do saldo disponível/);
    expect(text).toMatch(/Não muda o saldo até você marcar/);
  });
});

describe('Japonês continua de Lucas, qualquer que seja a conta que entrou primeiro', () => {
  it('Matheus abre Estudos antes: nada é criado; Lucas depois cria como dono; Matheus segue sem o curso', async () => {
    const content = new FakeLearningContentRepository();
    const make = (viewer: { userId: string; isOwner: boolean }) => {
      content.getViewer = async () => viewer;
      return new LearningCommands(content, new FakeStudySessionRepository(), new FakeEventRepository(), new FakeLessonProgressRepository());
    };
    await expect(make({ userId: MATHEUS, isOwner: false }).initializeDefaultLearningContent(WS)).rejects.toThrow();
    expect(content.courses.size).toBe(0);
    const course = await make({ userId: LUCAS, isOwner: true }).initializeDefaultLearningContent(WS);
    expect(course.ownerUserId).toBe(LUCAS);
    await expect(make({ userId: MATHEUS, isOwner: false }).initializeDefaultLearningContent(WS)).rejects.toThrow();
    expect(content.courses.size).toBe(1);
  });
});
