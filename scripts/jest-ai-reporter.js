const fs = require("fs");
const path = require("path");

function writeReporterSummary(summaryPath, summary) {
  const target = String(summaryPath || "").trim();
  if (!target) return;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(summary, null, 2));
  } catch (_) {
    // ignore
  }
}

class JestAIReporter {
  onRunComplete(_, aggregatedResults) {
    const summary = {
      summary: {
        totalTests: aggregatedResults.numTotalTests,
        failedTests: aggregatedResults.numFailedTests,
        passedTests: aggregatedResults.numPassedTests,
        runtimeErrorSuites: aggregatedResults.numRuntimeErrorTestSuites,
      },
    };

    if (aggregatedResults.numFailedTests > 0) {
      for (const result of aggregatedResults.testResults) {
        for (const assertion of result.testResults) {
          if (assertion.status === "failed") {
            console.log(
              `FAIL ${path.relative(process.cwd(), result.testFilePath)} :: ${assertion.fullName}`,
            );
          }
        }
      }
    }

    writeReporterSummary(process.env.AI_REPORTER_SUMMARY_PATH, summary);
  }
}

module.exports = JestAIReporter;
