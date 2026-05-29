const PREFIX = 'ssCalc:scenario:'

export function saveScenario(name, data) {
  localStorage.setItem(PREFIX + name, JSON.stringify(data))
}

export function loadScenario(name) {
  const raw = localStorage.getItem(PREFIX + name)
  return raw ? JSON.parse(raw) : null
}

export function listScenarios() {
  const names = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith(PREFIX)) names.push(key.slice(PREFIX.length))
  }
  return names.sort()
}

export function deleteScenario(name) {
  localStorage.removeItem(PREFIX + name)
}
