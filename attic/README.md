# Attic

Not deleted, because this project has no version control — `git
rev-parse` reports no repository, so an `rm` here is permanent.

## The leader subsystem (moved 2026-10-30)

Leaders were merged into ability cards. The measurements that made the
merge the right call:

  * LETO is already Arc. "Your cascades may start from any card you
    control" and Arc's "trigger this card's cascade from ANY card you
    control" are the same effect, standing versus one-shot.
  * TANTALUS is PRINCE. Its gate -- "only while you are behind" -- is
    open on 99.4% of your own turns, because captures accrue to whoever
    just placed, so the player about to move is almost always behind.
  * LOVER is dead. Its condition, three of your cards sharing an
    element, is met on 2.0% of turns. It measured +0.8 and fired in 3%
    of games.
  * PRINCE is the only one worth porting, as the `surge` ability.

So the merge ported one effect and dropped three, and deleted a
subsystem: a 2.4 MB differential fixture, 11 tests, a whole UI phase,
four state fields, and the unresolved `barFinalLeader` toggle that was
shipped as an option because the bots could not settle it.

Kept here in case the mass-swing design needs the history.
