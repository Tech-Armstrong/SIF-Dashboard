import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const backendDir = join(process.cwd(), "backend");
const python =
  process.platform === "win32"
    ? join(backendDir, ".venv", "Scripts", "python.exe")
    : join(backendDir, ".venv", "bin", "python");

if (!existsSync(python)) {
  console.error(
    `Backend venv not found at ${python}\n` +
      "Create it from backend/: python -m venv .venv && pip install -r requirements.txt",
  );
  process.exit(1);
}

const child = spawn(
  python,
  ["-m", "uvicorn", "main:app", "--reload", "--port", "8000"],
  { cwd: backendDir, stdio: "inherit", shell: false },
);

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
