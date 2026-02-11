import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export interface AIConfig {
  apiKey: string
  models: string  // comma-separated model names, e.g. "deepseek-v3.2,gemini-3-pro-preview"
}

interface AppConfig {
  token: string
  recentStocks: string[]
  aiConfig: AIConfig
}

const defaultConfig: AppConfig = {
  token: '',
  recentStocks: [],
  aiConfig: {
    apiKey: '',
    models: 'deepseek-v3.2'
  }
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'quant-config.json')
}

export function loadConfig(): AppConfig {
  try {
    const configPath = getConfigPath()
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8')
      return { ...defaultConfig, ...JSON.parse(data) }
    }
  } catch (e) {
    console.error('Failed to load config:', e)
  }
  return { ...defaultConfig }
}

export function saveConfig(config: Partial<AppConfig>): void {
  try {
    const current = loadConfig()
    const merged = { ...current, ...config }
    const configPath = getConfigPath()
    const dir = path.dirname(configPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8')
  } catch (e) {
    console.error('Failed to save config:', e)
  }
}

export function getToken(): string {
  return loadConfig().token
}

export function setToken(token: string): void {
  saveConfig({ token })
}

export function getAIConfig(): AIConfig {
  return loadConfig().aiConfig || defaultConfig.aiConfig
}

export function setAIConfig(config: Partial<AIConfig>): void {
  const current = getAIConfig()
  saveConfig({ aiConfig: { ...current, ...config } })
}
