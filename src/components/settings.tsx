"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Loader2, Save, Server, Sparkles, Lock } from "lucide-react"

export function Settings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState({
    gemini_api_key: "",
    ollama_endpoint: "https://ollama.com/",
    ollama_api_key: "",
    ai_provider: "ollama",
    ollama_model: "gemini-3-flash-preview"
  })

  const supabase = createClient()

  useEffect(() => {
    async function loadSettings() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('gemini_api_key, ollama_endpoint, ollama_api_key, ai_provider, ollama_model')
          .eq('id', user.id)
          .single()
        
        if (data) {
          setSettings({
            gemini_api_key: String(data.gemini_api_key || ""),
            ollama_endpoint: String(data.ollama_endpoint || "https://ollama.com/"),
            ollama_api_key: String(data.ollama_api_key || ""),
            ai_provider: String(data.ai_provider || "ollama"),
            ollama_model: String(data.ollama_model || "gemini-3-flash-preview")
          })
        }
      }
      setLoading(false)
    }
    loadSettings()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { error } = await supabase.from('profiles').update(settings).eq('id', user.id)
      if (error) alert("Ошибка при сохранении: " + error.message)
      else alert("Настройки сохранены!")
    }
    setSaving(false)
  }

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[#4fc3f7]" /></div>

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-[#e0e0e0] mb-8">Настройки ИИ</h1>

      <div className="space-y-8 bg-[#2a2a2a] p-6 rounded-xl border border-[#333]">
        <div className="space-y-4">
          <Label className="text-[#888] uppercase text-[10px] font-bold tracking-widest">Основной провайдер</Label>
          <RadioGroup 
            value={settings.ai_provider} 
            onValueChange={(v) => setSettings({...settings, ai_provider: v})}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2 bg-[#1f1f1f] p-3 rounded-lg border border-[#333] flex-1 cursor-pointer">
              <RadioGroupItem value="ollama" id="ollama" />
              <Label htmlFor="ollama" className="flex items-center gap-2 cursor-pointer">
                <Server className="w-4 h-4 text-orange-400" /> Ollama Cloud
              </Label>
            </div>
            <div className="flex items-center space-x-2 bg-[#1f1f1f] p-3 rounded-lg border border-[#333] flex-1 cursor-pointer">
              <RadioGroupItem value="gemini" id="gemini" />
              <Label htmlFor="gemini" className="flex items-center gap-2 cursor-pointer">
                <Sparkles className="w-4 h-4 text-[#4fc3f7]" /> Gemini (Google)
              </Label>
            </div>
          </RadioGroup>
        </div>

        {settings.ai_provider === 'ollama' ? (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-2">
            <div className="space-y-2">
              <Label htmlFor="ollama_url">Ollama Cloud Endpoint</Label>
              <Input 
                id="ollama_url"
                value={settings.ollama_endpoint}
                onChange={(e) => setSettings({...settings, ollama_endpoint: e.target.value})}
                placeholder="https://api.ollama.com/v1"
                className="bg-[#1f1f1f] border-[#333] text-[#e0e0e0]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ollama_key" className="flex items-center gap-2">
                <Lock className="w-3 h-3 text-[#4fc3f7]" /> API Key (Ollama Cloud)
              </Label>
              <Input 
                id="ollama_key"
                type="password"
                value={settings.ollama_api_key}
                onChange={(e) => setSettings({...settings, ollama_api_key: e.target.value})}
                placeholder="ollama_..."
                className="bg-[#1f1f1f] border-[#333] text-[#e0e0e0]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ollama_model">Модель</Label>
              <Input 
                id="ollama_model"
                value={settings.ollama_model}
                onChange={(e) => setSettings({...settings, ollama_model: e.target.value})}
                placeholder="gemini-3-flash-preview"
                className="bg-[#1f1f1f] border-[#333] text-[#e0e0e0]"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in slide-in-from-left-2">
            <div className="space-y-2">
              <Label htmlFor="gemini_key">Google API Key</Label>
              <Input 
                id="gemini_key"
                type="password"
                value={settings.gemini_api_key}
                onChange={(e) => setSettings({...settings, gemini_api_key: e.target.value})}
                placeholder="AIzaSy..."
                className="bg-[#1f1f1f] border-[#333] text-[#e0e0e0]"
              />
            </div>
          </div>
        )}

        <Button 
          onClick={handleSave} 
          disabled={saving}
          className="w-full bg-[#4fc3f7] hover:bg-[#4fc3f7]/90 text-[#1f1f1f] font-bold"
        >
          {saving ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Сохранить изменения
        </Button>
      </div>
    </div>
  )
}
