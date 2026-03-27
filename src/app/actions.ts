"use server"

import { setSettings } from "@/lib/db"
import { settingsSchema, type Settings } from "@/lib/settings-schema"

export async function saveSettings(data: Settings): Promise<void> {
  const validated = settingsSchema.parse(data)
  setSettings(validated)
}
