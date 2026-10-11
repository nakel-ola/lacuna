// Copy shared by the page and its structured data.

export const STATS = [
  { value: '6.2M', label: 'files scanned in 32 seconds' },
  { value: '100%', label: 'matches du, to the kilobyte' },
  { value: '6.6 MB', label: 'the whole app' },
  { value: '0', label: 'bytes sent off your Mac' },
];

export const FAQ = [
  {
    q: 'Is Lacuna free?',
    a: 'Yes. Lacuna is free and open source under the MIT license. There is no paid tier, no account and no trial.',
  },
  {
    q: 'Is it safe to delete files with Lacuna?',
    a: 'Lacuna never deletes anything outright. Items you collect are moved to the Trash, so you can put them back. Before anything moves you see the exact paths and the total size, and the folder you scanned can never be removed.',
  },
  {
    q: 'Why does Lacuna ask for Full Disk Access?',
    a: 'macOS protects some folders, such as Mail and Safari data. Without Full Disk Access their size cannot be counted and they show as “No permission”. Lacuna works without it; granting it just makes the totals complete.',
  },
  {
    q: 'Does Lacuna upload my file list?',
    a: 'No. Lacuna has no network access, analytics or telemetry. The scan stays in memory on your Mac and is gone when you quit.',
  },
  {
    q: 'How is it so fast?',
    a: 'The scanner is written in Rust. It reads a whole folder per system call with getattrlistbulk and runs 16 threads at once, so a disk with millions of files takes seconds, not minutes.',
  },
  {
    q: 'Which Macs does it support?',
    a: 'Any Mac running macOS 10.15 Catalina or later. Windows and Linux are on the roadmap.',
  },
];
