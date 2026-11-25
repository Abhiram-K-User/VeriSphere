/**
 * @file techDetector.ts
 * @package @verisphere/github-engine
 * @purpose Evidence-based technology detection per repository.
 *          Shared parsing helpers used by BOTH the GitHub GraphQL v4 scraper
 *          and the parallelized REST fallback scraper.
 */

import { Octokit } from "@octokit/rest";

export const PACKAGE_NAME_MAP: Record<string, string> = {
  react: "React",
  "react-dom": "React",
  next: "Next.js",
  express: "Express.js",
  fastify: "Fastify",
  mongoose: "MongoDB",
  prisma: "Prisma",
  "@prisma/client": "Prisma",
  tailwindcss: "Tailwind CSS",
  vue: "Vue.js",
  "@vue/core": "Vue.js",
  nuxt: "Nuxt.js",
  svelte: "Svelte",
  angular: "Angular",
  "@angular/core": "Angular",
  nestjs: "NestJS",
  "@nestjs/core": "NestJS",
  graphql: "GraphQL",
  "apollo-server": "GraphQL",
  socket: "Socket.io",
  "socket.io": "Socket.io",
  redis: "Redis",
  ioredis: "Redis",
  knex: "SQL",
  sequelize: "SQL",
  typeorm: "TypeORM",
  drizzle: "Drizzle ORM",
  mongodb: "MongoDB",
  "@supabase/supabase-js": "Supabase",
  supabase: "Supabase",
  firebase: "Firebase",
  "firebase-admin": "Firebase",
  pg: "PostgreSQL",
  postgres: "PostgreSQL",
  mysql: "MySQL",
  mysql2: "MySQL",
  sqlite3: "SQLite",
  jest: "Jest",
  vitest: "Vitest",
  webpack: "Webpack",
  vite: "Vite",
  astro: "Astro",
  trpc: "tRPC",
  "@trpc/server": "tRPC",
  zod: "Zod",
  ethers: "Blockchain",
  web3: "Blockchain",
  solc: "Blockchain",
  "@openzeppelin/contracts": "Blockchain",
  hardhat: "Blockchain",
  truffle: "Blockchain",
  "framer-motion": "Framer Motion",
  axios: "Axios",
  three: "Three.js",
};

export const PYTHON_PACKAGE_MAP: Record<string, string> = {
  flask: "Flask",
  "flask-cors": "Flask",
  django: "Django",
  fastapi: "FastAPI",
  torch: "PyTorch",
  torchvision: "PyTorch",
  tensorflow: "TensorFlow",
  keras: "Keras",
  timm: "Deep Learning",
  numpy: "NumPy",
  pandas: "Pandas",
  scipy: "SciPy",
  "scikit-learn": "Scikit-Learn",
  sklearn: "Scikit-Learn",
  opencv: "OpenCV",
  "opencv-python": "OpenCV",
  pillow: "Pillow / Image Processing",
  gunicorn: "Gunicorn",
  celery: "Celery",
  pytest: "Pytest",
  sqlalchemy: "SQLAlchemy",
  pydantic: "Pydantic",
  pymongo: "MongoDB",
  supabase: "Supabase",
  firebase_admin: "Firebase",
  "firebase-admin": "Firebase",
  transformers: "Hugging Face / Transformers",
  langchain: "LangChain",
  langgraph: "LangGraph",
  chromadb: "ChromaDB",
  groq: "Groq API",
  uvicorn: "FastAPI",
};

export const FILE_TECH_MAP: Record<string, string> = {
  Dockerfile: "Docker",
  "docker-compose.yml": "Docker",
  "docker-compose.yaml": "Docker",
  "next.config.js": "Next.js",
  "next.config.mjs": "Next.js",
  "next.config.ts": "Next.js",
  "angular.json": "Angular",
  "vite.config.js": "Vite",
  "vite.config.ts": "Vite",
  "requirements.txt": "Python",
  "pyproject.toml": "Python",
  "pom.xml": "Java / Spring",
  "build.gradle": "Java / Gradle",
  "build.gradle.kts": "Kotlin / Gradle",
  "Cargo.toml": "Rust",
  "go.mod": "Go",
  "pubspec.yaml": "Flutter",
  "flutter.yaml": "Flutter",
  "hardhat.config.js": "Blockchain",
  "hardhat.config.ts": "Blockchain",
  "truffle-config.js": "Blockchain",
  "truffle-config.ts": "Blockchain",
  "foundry.toml": "Blockchain",
  "anchor.toml": "Blockchain",
  "brownie-config.yaml": "Blockchain",
  Makefile: "Makefile",
  "CMakeLists.txt": "C / C++",
  "firebase.json": "Firebase",
};

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export function parsePackageJsonContent(content: string, techs: Set<string>): void {
  try {
    const pkg = JSON.parse(content) as PackageJson;
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };

    for (const pkgName of Object.keys(allDeps)) {
      if (PACKAGE_NAME_MAP[pkgName]) {
        techs.add(PACKAGE_NAME_MAP[pkgName]);
        continue;
      }
      const prefix = pkgName.split("/")[0];
      if (PACKAGE_NAME_MAP[prefix]) {
        techs.add(PACKAGE_NAME_MAP[prefix]);
      }
    }
  } catch {
    // Ignore JSON parse errors
  }
}

export function parseRequirementsContent(content: string, techs: Set<string>): void {
  try {
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const cleanLine = line.trim().split("#")[0].trim();
      if (!cleanLine) continue;
      const match = cleanLine.match(/^([a-zA-Z0-9_\-]+)/);
      if (match) {
        const pkgName = match[1].toLowerCase();
        if (PYTHON_PACKAGE_MAP[pkgName]) {
          techs.add(PYTHON_PACKAGE_MAP[pkgName]);
        }
      }
    }
  } catch {
    // Ignore parse errors
  }
}

export function applyLanguageAndFileHeuristics(
  techs: Set<string>,
  primaryLanguage?: string | null,
  languages?: string[],
  rootFileNames?: Iterable<string>
): void {
  const addLang = (lang?: string | null) => {
    if (!lang) return;
    const lower = lang.toLowerCase();
    if (lower === "solidity") {
      techs.add("Solidity");
      techs.add("Blockchain");
    } else if (lower === "python") {
      techs.add("Python");
    } else if (lower === "c") {
      techs.add("C");
    } else if (lower === "c++" || lower === "cpp") {
      techs.add("C++");
    } else if (lower === "kotlin") {
      techs.add("Kotlin");
    } else if (lower !== "unknown" && lower !== "undefined") {
      techs.add(lang);
    }
  };

  addLang(primaryLanguage);
  if (languages) {
    for (const l of languages) addLang(l);
  }

  if (rootFileNames) {
    for (const fileName of rootFileNames) {
      if (fileName.endsWith(".sol")) {
        techs.add("Solidity");
        techs.add("Blockchain");
      } else if (fileName.endsWith(".py")) {
        techs.add("Python");
      } else if (fileName.endsWith(".c") || fileName.endsWith(".h")) {
        techs.add("C");
      } else if (fileName.endsWith(".cpp") || fileName.endsWith(".hpp")) {
        techs.add("C++");
      } else if (fileName.endsWith(".kt")) {
        techs.add("Kotlin");
      }
      if (FILE_TECH_MAP[fileName]) {
        techs.add(FILE_TECH_MAP[fileName]);
      }
    }
  }
}

/**
 * Parallelized REST fallback technology detector (used only when GraphQL v4 is unavailable,
 * e.g. unauthenticated mode). Runs all root & subdirectory manifest fetches concurrently
 * via Promise.allSettled instead of sequential loops.
 */
export async function detectTechnologies(
  username: string,
  repoName: string,
  octokit: Octokit,
  primaryLanguage?: string
): Promise<string[]> {
  const techs = new Set<string>();
  applyLanguageAndFileHeuristics(techs, primaryLanguage);

  try {
    const response = await octokit.rest.repos.getContent({
      owner: username,
      repo: repoName,
      path: "",
    });

    const rootItems = response.data;
    if (Array.isArray(rootItems)) {
      const rootFiles = new Set(rootItems.map((item) => item.name));
      const subdirs = rootItems
        .filter((item) => item.type === "dir")
        .map((item) => item.name);

      applyLanguageAndFileHeuristics(techs, undefined, undefined, rootFiles);

      // Build parallel fetch tasks for root + existing target subdirectories
      const fetchTasks: Promise<void>[] = [];

      const fetchFileAndParse = async (filePath: string, kind: "pkg" | "req") => {
        try {
          const res = await octokit.rest.repos.getContent({
            owner: username,
            repo: repoName,
            path: filePath,
          });
          const fileData = res.data;
          if (!Array.isArray(fileData) && fileData.type === "file" && "content" in fileData) {
            const decoded = Buffer.from(fileData.content, "base64").toString("utf-8");
            if (kind === "pkg") parsePackageJsonContent(decoded, techs);
            else parseRequirementsContent(decoded, techs);
          }
        } catch {
          // File not present — silently ignore
        }
      };

      if (rootFiles.has("requirements.txt")) {
        fetchTasks.push(fetchFileAndParse("requirements.txt", "req"));
      }
      if (rootFiles.has("package.json")) {
        fetchTasks.push(fetchFileAndParse("package.json", "pkg"));
      }

      const targetSubdirs = new Set(["frontend", "client", "web", "backend", "api", "server"]);
      for (const dir of subdirs) {
        if (targetSubdirs.has(dir.toLowerCase())) {
          fetchTasks.push(fetchFileAndParse(`${dir}/package.json`, "pkg"));
          fetchTasks.push(fetchFileAndParse(`${dir}/requirements.txt`, "req"));
        }
      }

      if (fetchTasks.length > 0) {
        await Promise.allSettled(fetchTasks);
      }
    }
  } catch (error) {
    console.warn(
      `[techDetector] Could not detect technologies for ${username}/${repoName}:`,
      (error as Error).message
    );
  }

  return Array.from(techs).sort();
}
