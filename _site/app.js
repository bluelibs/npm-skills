const branchLabel = document.querySelector("#branch-label");
const codeCount = document.querySelector("#code-count");
const headingCount = document.querySelector("#heading-count");
const readingTime = document.querySelector("#reading-time");
const readmeContent = document.querySelector("#readme-content");
const renderStatus = document.querySelector("#render-status");
const repoLink = document.querySelector("#repo-link");
const repoName = document.querySelector("#repo-name");
const siteDescription = document.querySelector("#site-description");
const siteTitle = document.querySelector("#site-title");
const toc = document.querySelector("#toc");
const tocStatus = document.querySelector("#toc-status");
const devEventsPath = "/__dev/events";

let activeHeadingObserver;
let activeMarkdown = "";
let hasRevealedPage = false;

void initializePage();

async function initializePage() {
  const config = await loadSiteConfig();
  applyShellMetadata(config);

  try {
    const [markdown, marked] = await Promise.all([
      loadReadmeMarkdown(),
      loadMarked(),
    ]);

    renderMarkdown(markdown, config, marked);
    startDevReadmeRefresh(config, marked);

    renderStatus.textContent = "";
    renderStatus.classList.add("is-ready");
    revealPage();
  } catch (error) {
    console.error(error);
    renderStatus.textContent =
      "The README refused to put on its formalwear. Please check README.md deployment.";
    renderStatus.classList.add("is-error");
    tocStatus.textContent = "Map unavailable";
    revealPage();
  }
}

function revealPage() {
  if (hasRevealedPage) {
    return;
  }

  hasRevealedPage = true;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.add("is-page-ready");
    });
  });
}

function sanitizeRenderedMarkdown(html) {
  const template = document.createElement("template");
  template.innerHTML = html;

  const allowedTags = new Set([
    "A",
    "BLOCKQUOTE",
    "BR",
    "CODE",
    "DEL",
    "EM",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HR",
    "IMG",
    "LI",
    "OL",
    "P",
    "PRE",
    "STRONG",
    "TABLE",
    "TBODY",
    "TD",
    "TH",
    "THEAD",
    "TR",
    "UL",
  ]);
  const allowedAttributes = {
    A: new Set(["href", "title"]),
    IMG: new Set(["alt", "src", "title"]),
    P: new Set(["align"]),
  };

  for (const element of template.content.querySelectorAll("*")) {
    if (!allowedTags.has(element.tagName)) {
      if (element.tagName === "SCRIPT" || element.tagName === "STYLE") {
        element.remove();
        continue;
      }

      element.replaceWith(...element.childNodes);
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const allowedForTag = allowedAttributes[element.tagName] ?? new Set();
      const isAllowed = allowedForTag.has(attribute.name);
      const isEventHandler = attribute.name.startsWith("on");

      if (isEventHandler || !isAllowed) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (
        (attribute.name === "href" || attribute.name === "src") &&
        !isSafeUrl(attribute.value)
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  return template.content;
}

function isSafeUrl(value) {
  const normalizedValue = value.trim().toLowerCase();

  return (
    normalizedValue.startsWith("#") ||
    normalizedValue.startsWith("./") ||
    normalizedValue.startsWith("../") ||
    normalizedValue.startsWith("/") ||
    normalizedValue.startsWith("http://") ||
    normalizedValue.startsWith("https://") ||
    normalizedValue.startsWith("mailto:") ||
    normalizedValue.startsWith("data:image/")
  );
}

function applyShellMetadata(config) {
  const repository = config.repository || "";
  const branch = config.branch || "main";
  const repoUrl = repository ? `https://github.com/${repository}` : "#readme";

  document.title = repository
    ? `${repository} README Atelier`
    : "README Atelier";
  repoName.textContent = repository || "Local Pages preview";
  branchLabel.textContent = `branch / ${branch}`;
  repoLink.href = repoUrl;

  if (repository) {
    repoLink.target = "_blank";
    repoLink.rel = "noreferrer";
    return;
  }

  repoLink.removeAttribute("target");
  repoLink.removeAttribute("rel");
}

async function loadSiteConfig() {
  try {
    const response = await fetch("./site-config.json", { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Unexpected config response: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.warn("Falling back to inferred Pages config.", error);
    return inferSiteConfig();
  }
}

function inferSiteConfig() {
  const hostParts = window.location.hostname.split(".");
  const owner = hostParts[0] || "";
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const repo = pathParts[0] || "";
  const repository = owner && repo ? `${owner}/${repo}` : "";

  return {
    repository,
    owner,
    repo,
    branch: "main",
    readmePath: "README.md",
  };
}

async function loadReadmeMarkdown() {
  const response = await fetch("./README.md", { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Unable to load README.md (${response.status})`);
  }

  return response.text();
}

async function loadMarked() {
  const markedModule = await import(
    "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js"
  );
  const marked = markedModule.marked;

  marked.setOptions({
    gfm: true,
    breaks: false,
  });

  return marked;
}

function renderMarkdown(markdown, config, marked) {
  activeMarkdown = markdown;

  readmeContent.replaceChildren(
    sanitizeRenderedMarkdown(marked.parse(markdown)),
  );

  const headings = decorateHeadings(readmeContent);
  decorateLinks(readmeContent, config);
  decorateImages(readmeContent, config);
  decorateCodeBlocks(readmeContent);
  decorateComparisonBadges(readmeContent);
  renderTableOfContents(headings);
  updateStats(markdown, headings, readmeContent);
  updateHeroFromContent(config, readmeContent);
  tocStatus.textContent =
    headings.length > 0 ? `${headings.length} stops mapped` : "No headings found";
  observeHeadingVisibility(headings);
}

function startDevReadmeRefresh(config, marked) {
  if (!isLocalPreview() || typeof window.EventSource !== "function") {
    return;
  }

  let isRefreshingReadme = false;
  let shouldRefreshAgain = false;
  const devEvents = new EventSource(devEventsPath);

  const refreshReadme = () => {
    if (isRefreshingReadme) {
      shouldRefreshAgain = true;
      return;
    }

    isRefreshingReadme = true;

    void loadReadmeMarkdown()
      .then((latestMarkdown) => {
        if (latestMarkdown === activeMarkdown) {
          return;
        }

        renderMarkdown(latestMarkdown, config, marked);
      })
      .catch((error) => {
        console.warn("Unable to refresh README preview.", error);
      })
      .finally(() => {
        isRefreshingReadme = false;

        if (!shouldRefreshAgain) {
          return;
        }

        shouldRefreshAgain = false;
        refreshReadme();
      });
  };

  devEvents.addEventListener("readme-updated", refreshReadme);
  devEvents.addEventListener("page-reload", () => {
    window.location.reload();
  });

  window.addEventListener(
    "beforeunload",
    () => {
      devEvents.close();
    },
    { once: true },
  );
}

function decorateHeadings(container) {
  const slugCounts = new Map();
  const headings = [];

  container.querySelectorAll("h1, h2, h3").forEach((heading) => {
    const title = heading.textContent?.trim() || "section";
    const slug = createUniqueSlug(title, slugCounts);
    heading.id = slug;

    const anchor = document.createElement("a");
    anchor.href = `#${slug}`;
    anchor.className = "heading-anchor";
    anchor.setAttribute("aria-label", `Link to ${title}`);
    anchor.textContent = "#";
    heading.append(anchor);

    if (heading.tagName === "H1") {
      return;
    }

    headings.push({
      id: slug,
      title,
      level: Number.parseInt(heading.tagName.slice(1), 10),
    });
  });

  return headings;
}

function createUniqueSlug(title, slugCounts) {
  const baseSlug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section";
  const existingCount = slugCounts.get(baseSlug) || 0;
  slugCounts.set(baseSlug, existingCount + 1);

  return existingCount === 0 ? baseSlug : `${baseSlug}-${existingCount + 1}`;
}

function decorateLinks(container, config) {
  const repository = config.repository;
  const branch = config.branch || "main";
  const readmePath = config.readmePath || "README.md";

  container.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) {
      return;
    }

    if (href.startsWith("#")) {
      return;
    }

    if (isExternalUrl(href)) {
      link.target = "_blank";
      link.rel = "noreferrer";
      return;
    }

    if (!repository) {
      return;
    }

    const resolvedPath = resolveRepoPath(href, readmePath);
    const hash = extractHash(href);
    link.href = `https://github.com/${repository}/blob/${branch}/${resolvedPath}${hash}`;
    link.target = "_blank";
    link.rel = "noreferrer";
  });
}

function decorateImages(container, config) {
  const repository = config.repository;
  const branch = config.branch || "main";
  const readmePath = config.readmePath || "README.md";

  container.querySelectorAll("img[src]").forEach((image) => {
    const source = image.getAttribute("src");
    if (!source || isExternalUrl(source) || source.startsWith("data:")) {
      return;
    }

    if (!repository) {
      return;
    }

    const resolvedPath = resolveRepoPath(source, readmePath);
    image.src = `https://raw.githubusercontent.com/${repository}/${branch}/${resolvedPath}`;
    image.loading = "lazy";
  });
}

function decorateCodeBlocks(container) {
  container.querySelectorAll("pre > code").forEach((code) => {
    const language =
      code.className
        .split(" ")
        .find((value) => value.startsWith("language-"))
        ?.replace("language-", "") || "code";
    code.parentElement?.setAttribute("data-language", language);
  });
}

function decorateComparisonBadges(container) {
  const badgeLabels = {
    "Strong fit": "is-strong",
    "Indirect fit": "is-indirect",
    "Limited fit": "is-limited",
    "Not the focus": "is-neutral",
    "Not the core model": "is-neutral",
    "Built in": "is-strong",
  };

  container.querySelectorAll("td").forEach((cell) => {
    const text = cell.textContent?.trim();
    const badgeTone = text ? badgeLabels[text] : undefined;
    if (!badgeTone) {
      return;
    }

    const badge = document.createElement("span");
    badge.className = `comparison-badge ${badgeTone}`;
    badge.textContent = text;
    cell.textContent = "";
    cell.append(badge);
  });
}

function renderTableOfContents(headings) {
  toc.innerHTML = "";

  if (headings.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.textContent =
      "No headings yet. Either the README is shy or still loading.";
    toc.append(emptyState);
    return;
  }

  headings.forEach((heading) => {
    const link = document.createElement("a");
    link.href = `#${heading.id}`;
    link.textContent = heading.title;
    link.className = `toc-link level-${heading.level}`;
    toc.append(link);
  });
}

function updateStats(markdown, headings, container) {
  const words = markdown.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 180));
  const blocks = container.querySelectorAll("pre").length;

  readingTime.textContent = `${minutes} min`;
  headingCount.textContent = `${headings.length || 1} mapped`;
  codeCount.textContent = `${blocks} blocks`;
}

function updateHeroFromContent(config, container) {
  const firstHeading = container.querySelector("h1");
  const firstParagraph = container.querySelector("p");
  const repository = config.repository || "README";
  const repoShortName =
    config.repo || repository.split("/").pop() || repository;

  siteTitle.textContent =
    (firstHeading ? getElementLabel(firstHeading) : "") || repoShortName;
  siteDescription.textContent =
    firstParagraph?.textContent?.trim() ||
    "The repository README, rendered in a polished GitHub Pages experience.";
}

function observeHeadingVisibility(headings) {
  activeHeadingObserver?.disconnect();

  const tocLinks = new Map(
    Array.from(document.querySelectorAll(".toc-link")).map((link) => [
      link.getAttribute("href")?.slice(1),
      link,
    ]),
  );

  const observer = new IntersectionObserver(
    (entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort(
          (left, right) => right.intersectionRatio - left.intersectionRatio,
        )[0];

      if (!visibleEntry) {
        return;
      }

      document.querySelectorAll(".toc-link").forEach((link) => {
        link.classList.remove("is-active");
      });

      tocLinks.get(visibleEntry.target.id)?.classList.add("is-active");
    },
    {
      rootMargin: "0px 0px -70% 0px",
      threshold: [0.2, 0.5, 1],
    },
  );

  activeHeadingObserver = observer;

  headings.forEach((heading) => {
    const element = document.getElementById(heading.id);
    if (element) {
      observer.observe(element);
    }
  });
}

function isExternalUrl(value) {
  return /^(?:[a-z]+:)?\/\//i.test(value);
}

function resolveRepoPath(value, readmePath) {
  const basePath = readmePath.includes("/")
    ? readmePath.slice(0, readmePath.lastIndexOf("/") + 1)
    : "";
  const url = new URL(
    stripHashAndQuery(value),
    `https://repo.local/${basePath}`,
  );
  return url.pathname.replace(/^\/+/, "");
}

function stripHashAndQuery(value) {
  return value.split("#")[0].split("?")[0];
}

function extractHash(value) {
  const hashIndex = value.indexOf("#");
  return hashIndex === -1 ? "" : value.slice(hashIndex);
}

function getElementLabel(element) {
  const clone = element.cloneNode(true);
  clone
    .querySelectorAll(".heading-anchor")
    .forEach((anchor) => anchor.remove());
  return clone.textContent?.trim() || "";
}

function isLocalPreview() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}
