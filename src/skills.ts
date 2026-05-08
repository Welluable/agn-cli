import { readdir, readFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { parse } from 'yaml';
import { fileURLToPath } from 'node:url';

export type SkillMeta = {
    name?: string;
    description?: string;
    path: string;
    raw: string;
};

export const getGlobalSkillDirectory = async () => {
    const globalSkillDirectory = path.join(os.homedir(), '.agn', 'skills');
    if (!existsSync(globalSkillDirectory)) {
        await mkdir(globalSkillDirectory, { recursive: true });
    }
    return globalSkillDirectory;
}

export const getInternalSkillDirectory = async () => {
    // When compiled, this module lives in dist/skills.js and internal skills are copied to dist/skills/**
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(moduleDir, 'skills');
}

export const scanSkills = async () => {
    const internalSkillDirectory = process.env.AGN_INTERNAL_SKILLS_DIR ?? await getInternalSkillDirectory();
    const globalSkillDirectory = process.env.AGN_GLOBAL_SKILLS_DIR ?? await getGlobalSkillDirectory();
    const projectSkillDirectory = process.env.AGN_PROJECT_SKILLS_DIR ?? path.join(process.cwd(), '.agn', 'skills');

    const internalSkills = existsSync(internalSkillDirectory)
        ? (await readdir(internalSkillDirectory)).map(skill => path.join(internalSkillDirectory, skill))
        : [];

    const globalSkills = existsSync(globalSkillDirectory)
        ? (await readdir(globalSkillDirectory)).map(skill => path.join(globalSkillDirectory, skill))
        : [];

    const projectSkills = existsSync(projectSkillDirectory)
        ? (await readdir(projectSkillDirectory)).map(skill => path.join(projectSkillDirectory, skill))
        : [];

    const mergedSkillsByDirname = new Map<string, string>();

    // Precedence (lowest -> highest): internal < global < project
    for (const skillPath of internalSkills) {
        mergedSkillsByDirname.set(path.basename(skillPath), skillPath);
    }

    for (const skillPath of globalSkills) {
        mergedSkillsByDirname.set(path.basename(skillPath), skillPath);
    }

    for (const skillPath of projectSkills) {
        mergedSkillsByDirname.set(path.basename(skillPath), skillPath);
    }

    const mergedSkills = [...mergedSkillsByDirname.values()];

    return { internalSkills, globalSkills, projectSkills, mergedSkills };
}

export const extractSkillMeta = async (skillPath: string): Promise<SkillMeta> => {
    const skillFilePath = path.basename(skillPath) === 'SKILL.md'
        ? skillPath
        : path.join(skillPath, 'SKILL.md');

    const skill = await readFile(skillFilePath, 'utf8');
    const skillMetaMatch = skill.match(/^---\s*\n([\s\S]*?)\n---/m);

    if (!skillMetaMatch) {
        throw new Error(`Skill at ${skillFilePath} is missing YAML frontmatter`);
    }

    const raw = skillMetaMatch[1];
    const parsed = parse(raw) ?? {};

    return {
        ...parsed,
        path: skillFilePath,
        raw,
    };
}

const isMarkdownFile = (filePath: string) => path.extname(filePath).toLowerCase() === '.md';

const getSkillDirectory = (skillPath: string) => path.basename(skillPath) === 'SKILL.md'
    ? path.dirname(skillPath)
    : skillPath;

const findSkillPathByName = async (name: string): Promise<string | undefined> => {
    const { mergedSkills } = await scanSkills();

    for (const skillPath of mergedSkills) {
        if (path.basename(skillPath) === name) {
            return skillPath;
        }

        try {
            const skillMeta = await extractSkillMeta(skillPath);
            if (skillMeta.name === name) {
                return skillPath;
            }
        } catch {
            // Ignore invalid skill files while resolving by name.
        }
    }
}

const readSupportingMarkdownFiles = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...await readSupportingMarkdownFiles(entryPath));
            continue;
        }

        if (entry.isFile() && entry.name !== 'SKILL.md' && isMarkdownFile(entry.name)) {
            files.push(entryPath);
        }
    }

    return files.sort((a, b) => a.localeCompare(b));
}

const readSkillByPath = async (skillPath: string): Promise<string> => {
    const skillFilePath = path.basename(skillPath) === 'SKILL.md'
        ? skillPath
        : path.join(skillPath, 'SKILL.md');
    const skillDirectory = getSkillDirectory(skillPath);

    const skillFileStat = await stat(skillFilePath);
    if (!skillFileStat.isFile()) {
        throw new Error(`Skill file not found at ${skillFilePath}`);
    }

    const sections = [await readFile(skillFilePath, 'utf8')];
    const supportingMarkdownFiles = await readSupportingMarkdownFiles(skillDirectory);

    for (const filePath of supportingMarkdownFiles) {
        const relativePath = path.relative(skillDirectory, filePath);
        const content = await readFile(filePath, 'utf8');

        sections.push([
            `## Supporting file: ${relativePath}`,
            '',
            content,
        ].join('\n'));
    }

    return sections.join('\n\n');
}

export const readSkill = async (name: string): Promise<string> => {
    const skillPath = await findSkillPathByName(name);
    if (!skillPath) {
        throw new Error(`skill not found: ${name}`);
    }

    return readSkillByPath(skillPath);
}

export const loadExplicitSkills = async (skillNames: string | string[]): Promise<string> => {
    const requestedNames = (Array.isArray(skillNames) ? skillNames : [skillNames])
        .map(skillName => skillName.trim())
        .filter(Boolean);

    if (requestedNames.length === 0) {
        return '';
    }

    const skills = await Promise.all(requestedNames.map(readSkill));
    return skills.join('\n\n');
}

export const getAvailableSkills = async () => {
    const { mergedSkills } = await scanSkills();
    const skillsMeta = await Promise.all(mergedSkills.map(extractSkillMeta));
    return skillsMeta;
}

const trimDescription = (description: string, maxLength = 200) => {
    if (description.length <= maxLength) {
        return description;
    }

    return `${description.slice(0, maxLength - 3).trimEnd()}...`;
}

export const buildSkillIndex = async (): Promise<string> => {
    const skills = await getAvailableSkills();

    if (skills.length === 0) {
        return '';
    }

    return [
        "You have skills available that provide domain-specific knowledge. IMPORTANT: You MUST call read_skill BEFORE responding to any task that matches a skill below. Do NOT attempt to answer without first loading the relevant skill. Always err on the side of loading a skill if there's any possible match.",
        ...skills.map(skill => {
            const name = skill.name ?? path.basename(path.dirname(skill.path));
            const description = trimDescription(skill.description ?? '');

            return `- ${name}: ${description}`;
        }),
    ].join('\n');
}