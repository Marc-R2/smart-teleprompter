// The script library only lives in this browser's localStorage, which can be
// cleared at any time. A backup file is the user's own copy of all of it.

const BACKUP_APP = "smart-teleprompter";

export function createBackup(scripts, settings, date = new Date()) {
  return JSON.stringify(
    {
      app: BACKUP_APP,
      version: 1,
      exportedAt: date.toISOString(),
      scripts,
      settings,
    },
    null,
    2
  );
}

export function backupFileName(date = new Date()) {
  return `smart-teleprompter-backup-${date.toISOString().slice(0, 10)}.json`;
}

// Throws with a message for the user if this is not a usable backup. Backup
// files can come from anywhere, so only known fields of the right type survive.
export function parseBackup(fileText, defaultSettings) {
  let data;
  try {
    data = JSON.parse(fileText);
  } catch (_) {
    throw new Error("This file is not a valid backup.");
  }
  if (data?.app !== BACKUP_APP || !Array.isArray(data.scripts)) {
    throw new Error("This file is not a Smart Teleprompter backup.");
  }

  const scripts = data.scripts
    .filter((script) => typeof script?.text === "string" && script.text.trim())
    .map((script, position) => ({
      id: String(script.id ?? `restored-${position}`),
      name: String(script.name || "Restored script").slice(0, 100),
      text: script.text,
      language: typeof script.language === "string" ? script.language : "en-US",
      savedAt: typeof script.savedAt === "string" ? script.savedAt : data.exportedAt,
    }));

  const settings = {};
  for (const [key, fallback] of Object.entries(defaultSettings)) {
    const value = data.settings?.[key];
    if (typeof value === typeof fallback) settings[key] = value;
  }
  return { scripts, settings };
}

// Never loses anything: an existing script is only skipped if it is identical,
// and one that differs under the same id is kept next to the restored one.
export function mergeScripts(existing, restored, maxScripts) {
  const merged = [...existing];
  let added = 0;
  let duplicates = 0;
  let rejected = 0;
  restored.forEach((script, position) => {
    if (merged.some((s) => s.name === script.name && s.text === script.text)) {
      duplicates += 1;
    } else if (merged.length >= maxScripts) {
      rejected += 1;
    } else {
      const idTaken = merged.some((s) => s.id === script.id);
      merged.push(
        idTaken ? { ...script, id: `${Date.now()}-${position}` } : script
      );
      added += 1;
    }
  });
  return { scripts: merged, added, duplicates, rejected };
}
