"use client"

import { useState, type KeyboardEvent } from "react"
import { useApp, type Student } from "@/lib/context/app-context"
import { X, Plus, Search, ChevronRight } from "lucide-react"

function StudentChips() {
  const { students, removeStudent } = useApp()
  const recentlyAdded = students.filter((s) => {
    const diff = Date.now() - new Date(s.addedAt).getTime()
    return diff < 1000 * 60 * 60 * 24 * 7 // last 7 days
  })

  if (recentlyAdded.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {recentlyAdded.map((s) => (
        <span
          key={s.nickname}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#4fc3f7]/15 px-3 py-1 text-sm font-medium text-[#4fc3f7]"
        >
          {s.nickname}
          <button
            onClick={() => removeStudent(s.nickname)}
            className="rounded-full p-0.5 hover:bg-[#4fc3f7]/25 transition-colors"
            aria-label={`Удалить ${s.nickname}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  )
}

function AddStudentInput() {
  const [value, setValue] = useState("")
  const { addStudent } = useApp()

  const handleAdd = () => {
    if (value.trim()) {
      addStudent(value)
      setValue("")
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888]" />
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Введите ник на Lichess"
            className="w-full rounded-md border border-[#333] bg-[#2a2a2a] px-3 py-2 pl-9 text-sm text-[#e0e0e0] placeholder:text-[#666] focus:outline-none focus:ring-2 focus:ring-[#4fc3f7]/50 focus:border-[#4fc3f7] transition-colors"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!value.trim()}
          className="flex items-center gap-1.5 rounded-md bg-[#4fc3f7] px-4 py-2 text-sm font-medium text-[#1f1f1f] hover:bg-[#4fc3f7]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Добавить</span>
        </button>
      </div>
      <StudentChips />
    </div>
  )
}

function StudentRow({ student }: { student: Student }) {
  const { selectStudent } = useApp()

  return (
    <button
      onClick={() => selectStudent(student)}
      className="flex items-center gap-4 w-full rounded-lg bg-[#2a2a2a] border border-[#333] px-4 py-3 hover:border-[#4fc3f7]/40 hover:bg-[#2a2a2a]/80 transition-all group text-left"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4fc3f7]/15 text-[#4fc3f7] font-semibold text-sm">
        {student.nickname.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#e0e0e0] truncate">{student.nickname}</p>
        <p className="text-xs text-[#888] mt-0.5">
          {student.lastAnalysis
            ? `Последний анализ: ${student.lastAnalysis}`
            : "Ещё не анализировался"}
        </p>
      </div>
      {student.newGames > 0 && (
        <span className="shrink-0 rounded-full bg-[#4fc3f7]/15 px-2.5 py-0.5 text-xs font-medium text-[#4fc3f7]">
          {student.newGames} новых партий
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-[#666] group-hover:text-[#4fc3f7] transition-colors" />
    </button>
  )
}

export function Dashboard() {
  const { students } = useApp()

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 lg:px-0">
      <h1 className="text-2xl font-bold text-[#e0e0e0] text-balance" suppressHydrationWarning>Мои ученики</h1>
      <p className="mt-1 text-sm text-[#888]">
        Добавляйте учеников по нику на Lichess и анализируйте их партии
      </p>

      <div className="mt-6">
        <AddStudentInput />
      </div>

      <div className="mt-8 flex flex-col gap-2">
        {students.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#333] py-12 text-center">
            <p className="text-[#888] text-sm">
              Пока нет учеников. Добавьте первого ученика выше.
            </p>
          </div>
        ) : (
          students.map((s) => <StudentRow key={s.nickname} student={s} />)
        )}
      </div>
    </div>
  )
}
