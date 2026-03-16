import {
  createInteractivePrompt,
  getHelpText,
  parseCliArgs,
  runCli,
} from "../cli";
import {
  CliDependencies,
  CreateSkillTemplateReport,
  ExtractReport,
  Logger,
  OverwritePrompt,
} from "../types";

jest.mock("../extract", () => ({
  extractSkills: jest.fn(),
}));
jest.mock("../new-skill", () => ({
  createSkillTemplate: jest.fn(),
}));

const { extractSkills } = jest.requireMock("../extract") as {
  extractSkills: jest.Mock<Promise<ExtractReport>, [unknown]>;
};
const { createSkillTemplate } = jest.requireMock("../new-skill") as {
  createSkillTemplate: jest.Mock<Promise<CreateSkillTemplateReport>, [unknown]>;
};

beforeEach(() => {
  extractSkills.mockReset();
  createSkillTemplate.mockReset();
});

function createDependencies(
  overrides: Partial<CliDependencies> = {},
): CliDependencies {
  const logger: Logger = {
    info: jest.fn(),
    warn: jest.fn(),
  };

  return {
    stdout: {
      log: jest.fn(),
      error: jest.fn(),
    },
    logger,
    prompt: {
      confirmOverwrite: jest.fn().mockResolvedValue(true),
    },
    isInteractive: true,
    ...overrides,
  };
}

describe("cli", () => {
  it("parses supported arguments", () => {
    expect(
      parseCliArgs([
        "extract",
        "@bluelibs/runner",
        "--output=.agents/skills",
        "--only=@bluelibs/*,left-pad",
        "--dev=false",
        "--override",
      ]),
    ).toEqual({
      command: "extract",
      options: {
        packageNames: ["@bluelibs/runner"],
        outputDir: ".agents/skills",
        only: ["@bluelibs/*", "left-pad"],
        includeDevDependencies: false,
        override: true,
      },
    });

    expect(parseCliArgs(["extract", "--dev"])).toEqual({
      command: "extract",
      options: {
        includeDevDependencies: true,
      },
    });

    expect(parseCliArgs(["extract", "--dev=true"])).toEqual({
      command: "extract",
      options: {
        includeDevDependencies: true,
      },
    });

    expect(parseCliArgs(["extract", "--dev", "false"])).toEqual({
      command: "extract",
      options: {
        includeDevDependencies: false,
      },
    });

    expect(
      parseCliArgs(["extract", "--output", "skills", "--only", "pkg-a,pkg-b"]),
    ).toEqual({
      command: "extract",
      options: {
        outputDir: "skills",
        only: ["pkg-a", "pkg-b"],
      },
    });

    expect(parseCliArgs(["new", "my-skill"])).toEqual({
      command: "new",
      options: {
        skillName: "my-skill",
      },
    });

    expect(parseCliArgs(["new", "my-skill", "--folder=./"])).toEqual({
      command: "new",
      options: {
        skillName: "my-skill",
        folder: "./",
      },
    });

    expect(parseCliArgs(["new", "my-skill", "--folder", "templates"])).toEqual({
      command: "new",
      options: {
        skillName: "my-skill",
        folder: "templates",
      },
    });
  });

  it("throws on invalid arguments and booleans", () => {
    expect(() => parseCliArgs([])).toThrow("Missing command");
    expect(() => parseCliArgs(["list"])).toThrow("Unsupported command");
    expect(() => parseCliArgs(["extract", "--wat"])).toThrow("Unknown option");
    expect(() => parseCliArgs(["extract", "--output"])).toThrow(
      "Missing value for --output",
    );
    expect(() => parseCliArgs(["extract", "--only", "--override"])).toThrow(
      "Missing value for --only",
    );
    expect(() => parseCliArgs(["extract", "--dev=maybe"])).toThrow(
      "Invalid boolean value: maybe",
    );
    expect(() => parseCliArgs(["new"])).toThrow("Missing skill name for new");
    expect(() => parseCliArgs(["new", "one", "two"])).toThrow(
      "Unexpected extra arguments: two",
    );
    expect(() => parseCliArgs(["new", "my-skill", "--folder"])).toThrow(
      "Missing value for --folder",
    );
    expect(() => parseCliArgs(["new", "my-skill", "--wat"])).toThrow(
      "Unknown option: --wat",
    );
  });

  it("creates interactive prompt only when requested", async () => {
    expect(createInteractivePrompt(false)).toBeUndefined();

    const prompt = createInteractivePrompt(true) as OverwritePrompt;
    const questionSpy = jest
      .spyOn(require("node:readline/promises"), "createInterface")
      .mockReturnValue({
        question: jest.fn().mockResolvedValue("y"),
        close: jest.fn(),
      });

    await expect(prompt.confirmOverwrite("/tmp/skills")).resolves.toBe(true);
    expect(questionSpy).toHaveBeenCalledTimes(1);
  });

  it("runs the extractor and reports summary", async () => {
    extractSkills.mockResolvedValue({
      outputDir: "/tmp/skills",
      scannedPackages: ["pkg-a", "pkg-b"],
      extracted: [
        {
          packageName: "pkg-a",
          sourceDir: "/tmp/a",
          destinationDir: "/tmp/skills/pkg-a-alpha",
          destinationName: "pkg-a-alpha",
        },
      ],
      skipped: [
        {
          packageName: "pkg-b",
          sourceDir: "/tmp/b",
          destinationDir: "/tmp/skills/pkg-b-beta",
          reason: "missing-source",
        },
      ],
    });

    const dependencies = createDependencies();
    await expect(runCli(["extract"], dependencies)).resolves.toBe(0);
    expect(extractSkills).toHaveBeenCalledWith({
      logger: dependencies.logger,
      prompt: dependencies.prompt,
    });
    expect(dependencies.stdout.log).toHaveBeenCalledWith(
      "Extracted 1 skill(s) from 2 package(s) into /tmp/skills.",
    );
    expect(dependencies.stdout.log).toHaveBeenCalledWith("Skipped 1 skill(s).");
  });

  it("creates a skill template and reports its location", async () => {
    createSkillTemplate.mockResolvedValue({
      skillName: "my-skill",
      skillDir: "/tmp/.agents/skills/my-skill",
      skillFile: "/tmp/.agents/skills/my-skill/SKILL.md",
    });

    const dependencies = createDependencies();
    await expect(runCli(["new", "my-skill"], dependencies)).resolves.toBe(0);
    expect(createSkillTemplate).toHaveBeenCalledWith({
      skillName: "my-skill",
    });
    expect(dependencies.stdout.log).toHaveBeenCalledWith(
      "Created skill template at /tmp/.agents/skills/my-skill.",
    );
    expect(extractSkills).not.toHaveBeenCalled();
  });

  it("shows help for bare cli and help flags", async () => {
    const dependencies = createDependencies();

    await expect(runCli([], dependencies)).resolves.toBe(0);
    expect(dependencies.stdout.log).toHaveBeenCalledWith(getHelpText());
    expect(extractSkills).not.toHaveBeenCalled();

    const helpDependencies = createDependencies();
    await expect(runCli(["--help"], helpDependencies)).resolves.toBe(0);
    expect(helpDependencies.stdout.log).toHaveBeenCalledWith(getHelpText());
  });

  it("avoids passing prompts when override is enabled and returns errors", async () => {
    extractSkills.mockResolvedValueOnce({
      outputDir: "/tmp/skills",
      scannedPackages: [],
      extracted: [],
      skipped: [],
    });

    const firstDependencies = createDependencies();
    await expect(
      runCli(
        ["extract", "--override", "--output", "skills"],
        firstDependencies,
      ),
    ).resolves.toBe(0);
    expect(extractSkills).toHaveBeenLastCalledWith({
      outputDir: "skills",
      override: true,
      logger: firstDependencies.logger,
      prompt: undefined,
    });

    extractSkills.mockRejectedValueOnce(new Error("boom"));
    const secondDependencies = createDependencies();
    await expect(runCli(["extract"], secondDependencies)).resolves.toBe(1);
    expect(secondDependencies.stdout.error).toHaveBeenCalledWith("boom");

    extractSkills.mockRejectedValueOnce("string-failure");
    const thirdDependencies = createDependencies();
    await expect(runCli(["extract"], thirdDependencies)).resolves.toBe(1);
    expect(thirdDependencies.stdout.error).toHaveBeenCalledWith(
      "string-failure",
    );

    createSkillTemplate.mockRejectedValueOnce(new Error("already there"));
    const fourthDependencies = createDependencies();
    await expect(runCli(["new", "my-skill"], fourthDependencies)).resolves.toBe(
      1,
    );
    expect(fourthDependencies.stdout.error).toHaveBeenCalledWith(
      "already there",
    );
  });

  it("can build default dependencies when none are provided", async () => {
    extractSkills.mockResolvedValue({
      outputDir: "/tmp/skills",
      scannedPackages: [],
      extracted: [],
      skipped: [],
    });

    const originalStdinIsTTY = process.stdin.isTTY;
    const originalStdoutIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: true,
    });

    const logSpy = jest
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(runCli(["extract"])).resolves.toBe(0);
    const callOptions = extractSkills.mock.calls.at(-1)?.[0] as {
      logger: Logger;
    };
    callOptions.logger.info("hello");
    callOptions.logger.warn("heads-up");

    expect(logSpy).toHaveBeenCalledWith(
      "Extracted 0 skill(s) from 0 package(s) into /tmp/skills.",
    );
    expect(logSpy).toHaveBeenCalledWith("hello");
    expect(warnSpy).toHaveBeenCalledWith("heads-up");
    expect(errorSpy).not.toHaveBeenCalled();

    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: originalStdinIsTTY,
    });
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: originalStdoutIsTTY,
    });
  });
});
