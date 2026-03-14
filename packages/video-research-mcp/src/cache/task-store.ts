import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class TaskStore {
  constructor(private readonly baseDir: string) {}

  taskPath(taskId: string): string {
    return path.join(this.baseDir, taskId);
  }

  rawDir(taskId: string): string {
    return path.join(this.taskPath(taskId), 'raw');
  }

  derivedDir(taskId: string): string {
    return path.join(this.taskPath(taskId), 'derived');
  }

  async ensureTask(taskId: string): Promise<string> {
    const taskPath = this.taskPath(taskId);
    await mkdir(taskPath, { recursive: true });
    await mkdir(this.rawDir(taskId), { recursive: true });
    await mkdir(this.derivedDir(taskId), { recursive: true });
    return taskPath;
  }

  async writeJson(taskId: string, fileName: string, value: unknown): Promise<string> {
    await this.ensureTask(taskId);
    const filePath = path.join(this.taskPath(taskId), fileName);
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    return filePath;
  }

  async readJson<T>(taskId: string, fileName: string): Promise<T> {
    const filePath = path.join(this.taskPath(taskId), fileName);
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  }
}
