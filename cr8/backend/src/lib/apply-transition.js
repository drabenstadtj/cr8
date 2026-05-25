import { transition } from './request-machine.js'

/**
 * Applies a state machine transition to a request:
 * 1. Validates the transition (throws on invalid)
 * 2. Updates the Request row in the DB
 * 3. Writes a RequestEvent audit row
 * Returns { nextState, sideEffects } so the caller can execute effects.
 */
export async function applyTransition(prisma, request, event, payload = {}, reason = null) {
  const { nextState, data, sideEffects } = transition(request.status, event, payload)

  const now = new Date()

  await prisma.$transaction([
    prisma.request.update({
      where: { id: request.id },
      data: { status: nextState, statusUpdatedAt: now, ...data },
    }),
    prisma.requestEvent.create({
      data: {
        requestId: request.id,
        from: request.status,
        to: nextState,
        reason,
      },
    }),
  ])

  return { nextState, sideEffects }
}
