export type DayLog = {
  date: string
  total: number
}

export type History = Record<string, DayLog>
