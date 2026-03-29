import { join } from 'node:path';
import { loadAllSkills, renderPrompt } from './skills/loader.js';
import { runEvalSuite } from './evals/runner.js';
import { printSummaryTable } from './evals/reporter.js';

export class Orchestrator {
  constructor({ claude, codex }) {
    this.claude = claude;
    this.codex = codex;
  }

  async routeToClaude(prompt, options = {}) {
    return this.claude.run(prompt, options);
  }

  async routeToCodex(prompt, options = {}) {
    return this.codex.run(prompt, options);
  }

  async planAndImplement(task, { onPlanData, onImplData, onPhase } = {}) {
    // Phase 1: Codex creates the plan
    if (onPhase) onPhase('planning');

    const planPrompt =
      'You are a planning agent. Analyze the codebase and create a detailed, ' +
      'step-by-step implementation plan for the following task. ' +
      'Do NOT make any code changes — only output the plan.\n\n' +
      `Task: ${task}`;

    const planResult = await this.codex.run(planPrompt, {
      onData: onPlanData,
      readOnly: true,
    });

    if (!planResult.output) {
      throw new Error('Codex returned an empty plan');
    }

    // Phase 2: Claude implements the plan
    if (onPhase) onPhase('implementing');

    const implPrompt =
      'Implement the following plan created by another agent who analyzed the codebase.\n\n' +
      '## Plan\n' +
      planResult.output +
      '\n\n## Original Task\n' +
      task +
      '\n\nImplement each step carefully.';

    const implResult = await this.claude.run(implPrompt, {
      onData: onImplData,
      allowTools: true,
    });

    return {
      plan: planResult.output,
      implementation: implResult.output,
    };
  }

  async reversePlanAndImplement(task, { onPlanData, onImplData, onPhase } = {}) {
    // Phase 1: Claude creates the plan
    if (onPhase) onPhase('planning');

    const planPrompt =
      'You are a planning agent. Analyze the task and create a detailed, ' +
      'step-by-step implementation plan. ' +
      'Do NOT write any code — only output the plan.\n\n' +
      `Task: ${task}`;

    const planResult = await this.claude.run(planPrompt, {
      onData: onPlanData,
    });

    if (!planResult.output) {
      throw new Error('Claude returned an empty plan');
    }

    // Phase 2: Codex implements the plan
    if (onPhase) onPhase('implementing');

    const implPrompt =
      'Implement the following plan created by another agent.\n\n' +
      '## Plan\n' +
      planResult.output +
      '\n\n## Original Task\n' +
      task +
      '\n\nImplement each step carefully. Write all the code.';

    const implResult = await this.codex.run(implPrompt, {
      onData: onImplData,
    });

    return {
      plan: planResult.output,
      implementation: implResult.output,
    };
  }

  async askBoth(prompt, { onClaudeData, onCodexData, onPhase } = {}) {
    if (onPhase) onPhase('both');

    const [claudeResult, codexResult] = await Promise.all([
      this.claude.run(prompt, { onData: onClaudeData }),
      this.codex.run(prompt, { onData: onCodexData }),
    ]);

    return { claude: claudeResult, codex: codexResult };
  }

  // ── Skill Lab methods ────────────────────────────────────────────

  /**
   * Run a skill against a task directly.
   */
  async runSkill(skill, task, options = {}) {
    const prompt = renderPrompt(skill, task);
    const agentMethod = skill.targetAgent === 'claude' ? 'routeToClaude' : 'routeToCodex';
    return this[agentMethod](prompt, {
      allowTools: skill.allowTools ?? true,
      ...options,
    });
  }

  /**
   * Evaluate a skill by running its eval suite.
   */
  async evaluateSkill(skill, suitePath, options = {}) {
    return runEvalSuite(skill, suitePath, this, options);
  }

  /**
   * Auto-select the best skill for a task, then implement.
   *
   * 1. Load all skills
   * 2. Run eval suites for each candidate
   * 3. Pick the highest-scoring skill
   * 4. Use that skill's prompt template to implement the task
   */
  async autoImplement(task, options = {}) {
    const {
      skillsDir,
      evalsDir,
      onPhase,
      onData,
      candidateIds,
    } = options;

    const cwd = options.cwd || this.claude.cwd;

    // Load candidate skills
    const allSkills = await loadAllSkills(skillsDir);
    const candidates = candidateIds
      ? allSkills.filter((s) => candidateIds.includes(s.id))
      : allSkills;

    if (candidates.length === 0) {
      throw new Error('No candidate skills found');
    }

    // Evaluate each candidate
    const evalResults = [];
    for (const skill of candidates) {
      if (onPhase) onPhase('evaluating', skill.name);

      const suitePath = join(evalsDir, skill.id, 'suite.json');
      try {
        const result = await runEvalSuite(skill, suitePath, this, { cwd });
        evalResults.push({ skill, result });
        printSummaryTable(skill, result);
      } catch (err) {
        // Skill has no eval suite or it failed — score 0
        evalResults.push({
          skill,
          result: { aggregate: { totalScore: 0 }, cases: [] },
        });
      }
    }

    // Pick the winner
    evalResults.sort((a, b) => b.result.aggregate.totalScore - a.result.aggregate.totalScore);
    const winner = evalResults[0];

    if (onPhase) onPhase('winner', winner.skill.name);

    // Implement using the winning skill
    if (onPhase) onPhase('implementing', winner.skill.name);

    const prompt = renderPrompt(winner.skill, task);
    const implResult = await this.routeToClaude(prompt, {
      onData,
      allowTools: true,
      cwd,
    });

    return {
      winner: winner.skill,
      evalResults: evalResults.map((e) => ({
        skillId: e.skill.id,
        score: e.result.aggregate.totalScore,
      })),
      implementation: implResult,
    };
  }

  resetSessions() {
    this.claude.resetSession();
    this.codex.resetSession();
  }

  getSessions() {
    return {
      claude: this.claude.sessionId,
      codex: this.codex.threadId,
    };
  }

  killAll() {
    this.claude.kill();
    this.codex.kill();
  }
}
