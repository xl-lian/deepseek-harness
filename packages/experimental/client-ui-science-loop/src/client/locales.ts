/**
 * Locale-owned copy for the science loop card. The namespace is registered by
 * the browser plugin and bound to the keyed Chat renderer.
 */

export const NS = 'scienceLoop'

export type ScienceLoopKey =
  | 'title'
  | 'status.pending'
  | 'status.running'
  | 'status.completed'
  | 'status.failed'
  | 'status.cancelled'
  | 'status.interrupted'
  | 'status.blocked'
  | 'stage.scout'
  | 'stage.hypotheses'
  | 'stage.engineer'
  | 'stage.verifier'
  | 'stage.statistician'
  | 'stage.decide'
  | 'stage.report'
  | 'header.running'
  | 'header.elapsed'
  | 'header.expand'
  | 'rounds.label'
  | 'stage.mixedRoles'
  | 'member.output'
  | 'member.openSession'
  | 'member.verdict'
  | 'member.logs'
  | 'scout.metric'
  | 'decision.chosen'
  | 'report.path'
  | 'view.loop'
  | 'view.hint'
  | 'round.experiments'
  | 'ring.label'
  | 'ring.repair'
  | 'ring.shared'
  | 'ring.checks'
  | 'verifier.attempts'
  | 'verifier.failed'
  | 'verifier.warned'
  | 'verifier.passed'
  | 'verifier.skipped'
  | 'verifier.noChecks'
  | 'verifier.blockingTag'
  | 'outcome.chosen'
  | 'outcome.eliminated'
  | 'outcome.candidate'
  | 'outcome.none'
  | 'outcome.chosen.short'
  | 'outcome.eliminated.short'
  | 'outcome.candidate.short'
  | 'outcome.rank.short'
  | 'empty'
  | 'empty.notScience.title'
  | 'empty.notScience.body'
  | 'empty.science.title'
  | 'empty.science.body'
  | 'empty.science.skillLoadedBody'
  | 'empty.science.commandHint'
  | 'empty.unknown.title'
  | 'empty.unknown.body'
  | 'summary.baseline'
  | 'summary.noBaseline'
  | 'summary.hypotheses.count'
  | 'summary.hypotheses.item'
  | 'summary.engineer.pipelines'
  | 'summary.engineer.plan'
  | 'summary.engineer.repaired'
  | 'summary.verifier.counts'
  | 'summary.verifier.trust'
  | 'summary.verifier.blocking'
  | 'summary.statistician.best'
  | 'summary.decide.chosen'
  | 'summary.decide.candidates'
  | 'summary.report.path'
  | 'summary.report.result.ok'
  | 'summary.report.result.failed'
  | 'summary.report.issue'
  | 'summary.report.issues'
  | 'stage.emptyPending'
  | 'stage.emptyIdle'
  | 'detail.profile'
  | 'detail.risks'
  | 'detail.evidence'
  | 'detail.cv'
  | 'detail.prediction'
  | 'detail.rationale'
  | 'detail.design'
  | 'detail.expectedDelta'
  | 'detail.cost'
  | 'detail.leakage'
  | 'detail.seeds'
  | 'detail.cvDesign'
  | 'detail.plan'
  | 'detail.files'
  | 'detail.metrics'
  | 'detail.verifiedMetrics'
  | 'detail.trust'
  | 'detail.blocking'
  | 'detail.warnings'
  | 'detail.checks'
  | 'detail.notes'
  | 'detail.repaired'
  | 'detail.roundDesign'
  | 'detail.verifiedRuns'
  | 'detail.candidates'
  | 'detail.eliminated'
  | 'detail.budget'
  | 'detail.issues'
  | 'detail.strict'
  | 'detail.reportOk'
  | 'detail.reportFailed'
  | 'detail.statusDetail'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Science-agent loop card copy. */
    scienceLoop: ScienceLoopKey
  }
}

/** Simplified Chinese copy. */
export const zh: Record<ScienceLoopKey, string> = {
  'title': '科学 agent loop',
  'status.pending': '等待中',
  'status.running': '运行中',
  'status.completed': '已完成',
  'status.failed': '失败',
  'status.cancelled': '已取消',
  'status.interrupted': '已中断',
  'status.blocked': '受阻',
  'stage.scout': '侦察',
  'stage.hypotheses': '假设',
  'stage.engineer': '实验',
  'stage.verifier': '验证',
  'stage.statistician': '统计',
  'stage.decide': '决策',
  'stage.report': '报告',
  'header.running': '{count} 个节点运行中',
  'header.elapsed': '耗时 {time}',
  'header.expand': '展开大图',
  'rounds.label': '轮次',
  'stage.mixedRoles': '{count} 个角色',
  'member.output': '输出',
  'member.openSession': '打开子会话',
  'member.verdict': '验证结果',
  'member.logs': '日志',
  'scout.metric': '指标 {metric}',
  'decision.chosen': '选定 run {run}',
  'report.path': '报告：{path}',
  'view.loop': '架构',
  'view.hint': '点击环上的节点，查看该阶段在本实验中的具体内容。',
  'round.experiments': '{count} 个实验',
  'ring.label': '{key} 的实验环',
  'ring.repair': '修复',
  'ring.shared': '本轮所有实验共用此阶段',
  'ring.checks': '{fail} 失败 · {warn} 警告 · {pass} 通过',
  'verifier.attempts': '验证尝试',
  'verifier.failed': '未通过（{count}）',
  'verifier.warned': '警告（{count}）',
  'verifier.passed': '通过（{count}）',
  'verifier.skipped': '跳过（{count}）',
  'verifier.noChecks': '验证器没有报告逐项检查。',
  'verifier.blockingTag': '阻塞',
  'outcome.chosen': '本实验的 run {run} 被选为本轮结果。',
  'outcome.eliminated': 'run {run} 被淘汰：{reason}',
  'outcome.candidate': 'run {run} 为候选第 {rank} 名 · 均值 {mean} ± {sd}',
  'outcome.none': '本实验没有 run 进入决策。',
  'outcome.chosen.short': '选定',
  'outcome.eliminated.short': '淘汰',
  'outcome.candidate.short': '候选',
  'outcome.rank.short': '第 {rank} 名',
  'empty': '等待本轮开始',
  'empty.notScience.title': '当前不是 Science Agent 会话',
  'empty.notScience.body': '当前使用 {preset}。请新建会话并选择 Science Agent 后再运行实验',
  'empty.science.title': 'Science Agent 尚未开始 round',
  'empty.science.body': 'Loop 只记录结构化 round，手动运行的 Python 脚本不会出现在这里',
  'empty.science.skillLoadedBody': '科学 skill 已加载，但还没有启动结构化 round。手动运行的 Python 脚本不会出现在这里',
  'empty.science.commandHint': '从这里开始',
  'empty.unknown.title': '没有找到科学 round',
  'empty.unknown.body': 'Loop 只展示 Science Agent 的结构化 round。临时脚本不会出现在这里',
  'summary.baseline': '已有 baseline',
  'summary.noBaseline': '无 baseline',
  'summary.hypotheses.count': '{count} 个假设',
  'summary.hypotheses.item': '{id}：{statement}',
  'summary.engineer.pipelines': '{count} 条实验流水线',
  'summary.engineer.plan': '计划：{plan}',
  'summary.engineer.repaired': '已修复并重跑',
  'summary.verifier.counts': '{pass} 通过 · {warn} 警告 · {fail} 失败',
  'summary.verifier.trust': '可信度 {trust}',
  'summary.verifier.blocking': '阻塞项：{text}',
  'summary.statistician.best': '最佳 {run} = {value}{delta}',
  'summary.decide.chosen': '选定 {run}（{rationale}）',
  'summary.decide.candidates': '{count} 个候选 · {eliminated} 个淘汰',
  'summary.report.path': '报告 {path}',
  'summary.report.result.ok': '严格检查通过',
  'summary.report.result.failed': '严格检查未通过',
  'summary.report.issue': 'L{line}: {token}',
  'summary.report.issues': '{count} 个问题',
  'stage.emptyPending': '本阶段尚未开始。',
  'stage.emptyIdle': '本阶段本轮未执行。',
  'detail.profile': '数据概览',
  'detail.risks': '风险',
  'detail.evidence': '证据',
  'detail.cv': '交叉验证',
  'detail.prediction': '可证伪预测',
  'detail.rationale': '动机',
  'detail.design': '实验设计',
  'detail.expectedDelta': '预期提升',
  'detail.cost': '成本',
  'detail.leakage': '泄漏风险',
  'detail.seeds': '种子',
  'detail.cvDesign': 'CV 设计',
  'detail.plan': '实现计划',
  'detail.files': '改动文件',
  'detail.metrics': '指标',
  'detail.verifiedMetrics': '验证指标',
  'detail.trust': '可信度',
  'detail.blocking': '阻塞问题',
  'detail.warnings': '警告',
  'detail.checks': '检查项',
  'detail.notes': '备注',
  'detail.repaired': '已修复',
  'detail.roundDesign': '轮次设计复核',
  'detail.verifiedRuns': '已验证 run',
  'detail.candidates': '候选 run',
  'detail.eliminated': '淘汰',
  'detail.budget': '预算',
  'detail.issues': '问题',
  'detail.strict': '严格模式',
  'detail.reportOk': '通过',
  'detail.reportFailed': '未通过',
  'detail.statusDetail': '状态明细',
}

/** English copy. */
export const en: Record<ScienceLoopKey, string> = {
  'title': 'Science loop',
  'status.pending': 'Pending',
  'status.running': 'Running',
  'status.completed': 'Completed',
  'status.failed': 'Failed',
  'status.cancelled': 'Cancelled',
  'status.interrupted': 'Interrupted',
  'status.blocked': 'Blocked',
  'stage.scout': 'Scout',
  'stage.hypotheses': 'Hypotheses',
  'stage.engineer': 'Engineer',
  'stage.verifier': 'Verifier',
  'stage.statistician': 'Statistician',
  'stage.decide': 'Decide',
  'stage.report': 'Report',
  'header.running': '{count} running',
  'header.elapsed': '{time} elapsed',
  'header.expand': 'Expand',
  'rounds.label': 'Rounds',
  'stage.mixedRoles': '{count} roles',
  'member.output': 'Output',
  'member.openSession': 'Open session',
  'member.verdict': 'Verdict',
  'member.logs': 'Logs',
  'scout.metric': 'Metric {metric}',
  'decision.chosen': 'Chosen run {run}',
  'report.path': 'Report: {path}',
  'view.loop': 'Loop',
  'view.hint': 'Click a node on the ring to see what that stage did in this experiment.',
  'round.experiments': '{count} experiments',
  'ring.label': 'Loop of {key}',
  'ring.repair': 'repair',
  'ring.shared': 'Shared by every experiment in this round',
  'ring.checks': '{fail} failed · {warn} warned · {pass} passed',
  'verifier.attempts': 'Verification attempts',
  'verifier.failed': 'Failed ({count})',
  'verifier.warned': 'Warned ({count})',
  'verifier.passed': 'Passed ({count})',
  'verifier.skipped': 'Skipped ({count})',
  'verifier.noChecks': 'The verifier reported no individual checks.',
  'verifier.blockingTag': 'blocking',
  'outcome.chosen': 'Run {run} from this experiment was chosen for the round.',
  'outcome.eliminated': 'Run {run} was eliminated: {reason}',
  'outcome.candidate': 'Run {run} is candidate #{rank} · mean {mean} ± {sd}',
  'outcome.none': 'No run from this experiment reached the decision.',
  'outcome.chosen.short': 'Chosen',
  'outcome.eliminated.short': 'Eliminated',
  'outcome.candidate.short': 'Candidate',
  'outcome.rank.short': 'Rank {rank}',
  'empty': 'Waiting for the round to start',
  'empty.notScience.title': 'This session is not Science Agent',
  'empty.notScience.body': 'This session uses {preset}. Start a new chat with Science Agent before running experiments.',
  'empty.science.title': 'Science Agent has not started a round',
  'empty.science.body': 'Loop records structured rounds. Python scripts run directly do not appear here.',
  'empty.science.skillLoadedBody': 'The science skill is loaded, but no structured round has started. Python scripts run directly do not appear here.',
  'empty.science.commandHint': 'Start with',
  'empty.unknown.title': 'No science round found',
  'empty.unknown.body': 'Loop shows structured Science Agent rounds. Ad hoc scripts do not appear here.',
  'summary.baseline': 'baseline present',
  'summary.noBaseline': 'no baseline',
  'summary.hypotheses.count': '{count} hypotheses',
  'summary.hypotheses.item': '{id}: {statement}',
  'summary.engineer.pipelines': '{count} pipelines',
  'summary.engineer.plan': 'Plan: {plan}',
  'summary.engineer.repaired': 'repaired and re-run',
  'summary.verifier.counts': '{pass} pass · {warn} warn · {fail} fail',
  'summary.verifier.trust': 'trust {trust}',
  'summary.verifier.blocking': 'blocking: {text}',
  'summary.statistician.best': 'best {run} = {value}{delta}',
  'summary.decide.chosen': 'Chosen {run} ({rationale})',
  'summary.decide.candidates': '{count} candidates · {eliminated} eliminated',
  'summary.report.path': 'Report {path}',
  'summary.report.result.ok': 'strict check passed',
  'summary.report.result.failed': 'strict check failed',
  'summary.report.issue': 'L{line}: {token}',
  'summary.report.issues': '{count} issues',
  'stage.emptyPending': 'This stage has not started yet.',
  'stage.emptyIdle': 'This stage did not run in this round.',
  'detail.profile': 'Data profile',
  'detail.risks': 'Risks',
  'detail.evidence': 'Evidence',
  'detail.cv': 'Cross-validation',
  'detail.prediction': 'Falsifiable prediction',
  'detail.rationale': 'Rationale',
  'detail.design': 'Design',
  'detail.expectedDelta': 'Expected delta',
  'detail.cost': 'Cost',
  'detail.leakage': 'Leakage risk',
  'detail.seeds': 'Seeds',
  'detail.cvDesign': 'CV design',
  'detail.plan': 'Implementation plan',
  'detail.files': 'Files',
  'detail.metrics': 'Metrics',
  'detail.verifiedMetrics': 'Verified metrics',
  'detail.trust': 'Trust',
  'detail.blocking': 'Blocking failures',
  'detail.warnings': 'Warnings',
  'detail.checks': 'Checks',
  'detail.notes': 'Notes',
  'detail.repaired': 'Repaired',
  'detail.roundDesign': 'Round design review',
  'detail.verifiedRuns': 'Verified runs',
  'detail.candidates': 'Candidates',
  'detail.eliminated': 'Eliminated',
  'detail.budget': 'Budget',
  'detail.issues': 'Issues',
  'detail.strict': 'Strict mode',
  'detail.reportOk': 'passed',
  'detail.reportFailed': 'failed',
  'detail.statusDetail': 'Status detail',
}
