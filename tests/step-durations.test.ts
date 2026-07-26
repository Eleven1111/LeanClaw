import { describe, expect, it } from 'vitest'
import { groupStepDurations, stepDurationsFor } from '../src/runtime/step-durations'

describe('groupStepDurations（一次查询构建全 recipe 的步骤时长索引）', () => {
  it('按 recipe 与步骤序号分组，时长为毫秒差值', () => {
    const index = groupStepDurations([
      {
        recipeId: 'file-edit-summarize',
        idx: 0,
        startedAt: '2026-07-25T00:00:00.000Z',
        endedAt: '2026-07-25T00:00:02.000Z'
      },
      {
        recipeId: 'file-edit-summarize',
        idx: 0,
        startedAt: '2026-07-25T00:00:00.000Z',
        endedAt: '2026-07-25T00:00:04.000Z'
      },
      {
        recipeId: 'deep-research',
        idx: 1,
        startedAt: '2026-07-25T00:00:00.000Z',
        endedAt: '2026-07-25T00:00:01.000Z'
      }
    ])

    expect(index.get('file-edit-summarize')?.get(0)).toEqual([2000, 4000])
    expect(index.get('deep-research')?.get(1)).toEqual([1000])
    expect(index.get('deep-research')?.get(0)).toBeUndefined()
  })

  it('丢弃无法解析的时间戳，不产生 NaN 时长', () => {
    const index = groupStepDurations([
      { recipeId: 'r', idx: 0, startedAt: 'not-a-date', endedAt: '2026-07-25T00:00:02.000Z' },
      { recipeId: 'r', idx: 0, startedAt: '2026-07-25T00:00:00.000Z', endedAt: 'nope' },
      {
        recipeId: 'r',
        idx: 0,
        startedAt: '2026-07-25T00:00:00.000Z',
        endedAt: '2026-07-25T00:00:03.000Z'
      }
    ])

    expect(index.get('r')?.get(0)).toEqual([3000])
  })

  it('空输入返回空索引', () => {
    expect(groupStepDurations([]).size).toBe(0)
  })
})

describe('stepDurationsFor（单任务回退路径与预计算路径同义）', () => {
  it('预计算索引命中时直接返回该 recipe 的分组', () => {
    const index = groupStepDurations([
      { recipeId: 'r', idx: 2, startedAt: '2026-07-25T00:00:00.000Z', endedAt: '2026-07-25T00:00:05.000Z' }
    ])
    expect(stepDurationsFor(index, 'r').get(2)).toEqual([5000])
  })

  it('索引中没有该 recipe 时返回空 Map 而不是 undefined', () => {
    const index = groupStepDurations([])
    expect(stepDurationsFor(index, 'missing')).toBeInstanceOf(Map)
    expect(stepDurationsFor(index, 'missing').size).toBe(0)
  })
})
