import { runCli } from "./src/cli";

void runCli(process.argv.slice(2)).then((exitCode) => {
  process.exit(exitCode);
});
