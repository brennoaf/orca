const MAX_CONCURRENT_AVATAR_REQUESTS = 4

const pendingRequests: (() => void)[] = []
let activeRequestCount = 0

function runNextRequests(): void {
  while (activeRequestCount < MAX_CONCURRENT_AVATAR_REQUESTS) {
    const start = pendingRequests.shift()
    if (!start) {
      return
    }
    activeRequestCount += 1
    start()
  }
}

export function queueZApiConversationAvatarRequest<T>(request: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pendingRequests.push(() => {
      void Promise.resolve()
        .then(request)
        .then(resolve, reject)
        .finally(() => {
          activeRequestCount -= 1
          runNextRequests()
        })
    })
    runNextRequests()
  })
}
