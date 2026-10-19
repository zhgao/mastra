import { createOpenAI } from '@ai-sdk/openai-v5';
import { it, expect, vi } from 'vitest';
import { createScorer } from '../../../../evals';
import { MockMemory } from '../../../../memory/mock';
import { describeForAllEngines, runLoopScenario, useLoopScenarioAimock } from '../aimock-scenario';
import { SCENARIO_MODEL_ID } from '../types';

const getMock = useLoopScenarioAimock();

/**
 * Regression test for https://github.com/mastra-ai/mastra/issues/27579
 *
 * A live scorer supplied only at call time (or via `defaultOptions.scorers`)
 * — i.e. never registered on the agent or on Mastra — must still run. The
 * scorer hook used to re-resolve the scorer by id against the registries only,
 * so the score was silently dropped with MASTRA_SCORER_NOT_FOUND.
 *
 * Durable/evented engines are skipped: they serialize the scorer config by
 * name and resolve it from Mastra on the worker, so an unregistered scorer
 * object cannot cross that boundary by design.
 */
describeForAllEngines(
  'AIMock loop scenario: unregistered call-time scorer still runs',
  engine => {
    it('runs a scorer supplied via defaultOptions.scorers without registration', async () => {
      const llm = getMock();
      const openai = createOpenAI({
        apiKey: 'test-key',
        baseURL: `${llm.url.replace(/\/+$/, '')}/v1`,
      });
      const memory = new MockMemory();

      const generateScore = vi.fn(() => 0.9);
      const scorer = createScorer({
        id: 'calltime-scorer',
        name: 'Calltime Scorer',
        description: 'Supplied at call time, registered nowhere',
      }).generateScore(generateScore);

      const { output } = await runLoopScenario({
        engine,
        llm,
        model: openai(SCENARIO_MODEL_ID),
        prompt: 'Say hello',
        memory,
        threadId: 'calltime-scorer-thread-1',
        resourceId: 'user-1',
        defaultOptions: {
          scorers: { 'calltime-scorer': { scorer } },
        } as any,
        fixtures: llm => {
          llm.on({ endpoint: 'chat', sequenceIndex: 0 }, { content: 'Hello!' });
        },
      });

      expect(await output.text).toContain('Hello!');

      // Live scoring is fire-and-forget (executeHook defers via setImmediate).
      await vi.waitFor(() => expect(generateScore).toHaveBeenCalledTimes(1), { timeout: 15000 });
    });
  },
  { skip: ['durable', 'evented'] },
);
