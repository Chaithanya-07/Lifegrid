import { Icon } from './Icon'
import { Modal } from './Modal'
import { hashFor } from '../useRoute'

/** Short, accurate orientation: what each part of Lifegrid does and the exact reward rules. */
export function HelpCenter({ onClose, onShortcuts }: { onClose: () => void; onShortcuts: () => void }) {
  return (
    <Modal title="Help Center" size="md" onClose={onClose}>
      <div className="help">
        <section>
          <h3><Icon name="plus" /> Adding tasks</h3>
          <p>
            Press <kbd>Q</kbd> to quick-add a task in plain language, for example <em>“Call Sam tomorrow 5pm !high #work”</em>.
            Press <kbd>N</kbd> for the full editor, where notes, subtasks, reminders, repeats and files live under “More details”.
          </p>
        </section>
        <section>
          <h3><Icon name="search" /> Moving around</h3>
          <p>
            <kbd>Ctrl</kbd> <kbd>K</kbd> opens the command palette. Pages are grouped as Tasks, Plan, Organize and Insights.
            Open <a href={hashFor('settings', 'shortcuts')} onClick={onClose}>Settings → Keyboard shortcuts</a> or{' '}
            <button type="button" className="linklike" onClick={onShortcuts}>view every shortcut</button>.
          </p>
        </section>
        <section>
          <h3><Icon name="trophy" /> XP, levels and streaks</h3>
          <p>
            Completing a task earns XP once: Low 5, Medium 10, High 15, Urgent 15. Finishing every eligible task due on a day adds a
            20 XP bonus. Every 100 XP is a level. Rewards are calculated by the server, so they cannot be earned twice.
          </p>
        </section>
        <section>
          <h3><Icon name="sun" /> Time-based colours</h3>
          <p>
            Pages stay white; only accents follow your device clock, from a fresh green in the morning to a critical red between
            5:50 PM and 7 PM. The period label in the top bar shows where you are in the day.
          </p>
        </section>
        <section>
          <h3><Icon name="download" /> Your data</h3>
          <p>
            Backups, exports and imports are under <a href={hashFor('settings', 'backup')} onClick={onClose}>Settings → Backup &amp; data</a>.
          </p>
        </section>
      </div>
    </Modal>
  )
}
