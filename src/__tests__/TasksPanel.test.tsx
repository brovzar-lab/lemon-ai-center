import { render, screen } from '@testing-library/react'
import { TasksPanel } from '../components/TasksPanel'
import { useTaskStore } from '../stores/useTaskStore'
import { seeds } from '../data/seeds'

beforeEach(() => {
  useTaskStore.setState({ tasks: seeds.tasks })
})

test('TasksPanel renders three columns', () => {
  render(<TasksPanel />)
  expect(screen.getByText('NOW')).toBeInTheDocument()
  expect(screen.getByText('NEXT')).toBeInTheDocument()
  expect(screen.getByText('ORBIT')).toBeInTheDocument()
})

test('NOW column shows now-bucket tasks', () => {
  render(<TasksPanel />)
  // The NOW bucket is expanded by default (NEXT/ORBIT collapsed), so its active
  // tasks render their titles inline. Assert each one is visible.
  const nowTasks = seeds.tasks.filter(t => t.bucket === 'now' && !t.done)
  for (const task of nowTasks) {
    expect(screen.getByText(task.title)).toBeInTheDocument()
  }
})
