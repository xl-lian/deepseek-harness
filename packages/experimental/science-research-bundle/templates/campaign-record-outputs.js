    // dsh only: record this round's close output for the run card and the Runs tab. Every value comes
    // straight from `sagent round close`, never from an agent's own report.
    if (typeof metric === 'function') {
      if (typeof c.delta === 'number') metric('round_delta', c.delta, { step: i })
      metric('candidates', rounds[rounds.length - 1].candidates, { step: i })
    }
    if (typeof artifact === 'function' && c.report && c.report.path) artifact(c.report.path, `Round ${i + 1} report (${rid})`)
