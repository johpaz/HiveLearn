import { describe, expect, test } from 'bun:test'
import { CURRICULUM_NODES, curriculumRoute, coordinatorCurriculumContext, validateCurricularBlueprint } from './curriculum'
import { teachingMaterial } from './curriculum-content'

describe('canonical curriculum', () => {
  test('all twenty age and level programs are system-owned and isolated', () => {
    const ids = new Set<string>()
    for (const age of [8, 12, 15, 18]) {
      for (const level of ['fundamentos', 'usuario_responsable', 'aplicador', 'constructor', 'creador_avanzado'] as const) {
        const route = curriculumRoute(age, level)
        ids.add(route.suggestedProgram.id)
        expect(route.suggestedProgram.project.length).toBeGreaterThan(20)
        expect(route.suggestedProgram.evidence.length).toBeGreaterThan(20)
        expect(route.suggestedProgram.stages).toHaveLength(5)
        route.suggestedProgram.stages.push('changed')
        expect(curriculumRoute(age, level).suggestedProgram.stages).toHaveLength(5)
        expect(coordinatorCurriculumContext(age, level)).toContain(route.suggestedProgram.project)
      }
    }
    expect(ids.size).toBe(20)
  })
  test('every competency has system-owned content, age adaptation and rubric', () => {
    for (const node of CURRICULUM_NODES) {
      expect(teachingMaterial(node.id, 8).explanation.length).toBeGreaterThan(100)
      expect(teachingMaterial(node.id, 18).rubric).toHaveLength(3)
      expect(teachingMaterial(node.id, 8).practice).not.toBe(teachingMaterial(node.id, 18).practice)
    }
  })
  test('coordinator plans require matching version and available canonical identifiers', () => {
    const route = curriculumRoute(12, 'constructor')
    const plan = { curriculumVersion: route.version, nodos: [{ id: 'one', competencyId: 'ai-agency' }] }
    expect(() => validateCurricularBlueprint(plan, route)).not.toThrow()
    expect(() => validateCurricularBlueprint({ ...plan, curriculumVersion: 'invented' }, route)).toThrow()
    expect(() => validateCurricularBlueprint({ ...plan, nodos: [{ id: 'one', competencyId: 'system-design' }] }, route)).toThrow()
    expect(() => validateCurricularBlueprint({ ...plan, nodos: [plan.nodos[0], plan.nodos[0]] }, route)).toThrow()
  })
  test('unique identifiers and topological prerequisites', () => {
    const seen = new Set<string>()
    for (const node of CURRICULUM_NODES) {
      expect(seen.has(node.id)).toBe(false)
      for (const dependency of node.prerequisites) expect(seen.has(dependency)).toBe(true)
      expect(node.sources.length).toBeGreaterThan(0)
      seen.add(node.id)
    }
  })
  test('age changes guidance, not proficiency', () => {
    for (const age of [8, 11, 12, 14, 15, 17, 18, 80]) {
      expect(curriculumRoute(age, 'constructor').nodes.map(n => n.id)).toEqual(curriculumRoute(18, 'constructor').nodes.map(n => n.id))
    }
    expect(curriculumRoute(11, 'fundamentos').ageBand).toBe('ninez')
    expect(curriculumRoute(12, 'fundamentos').ageBand).toBe('adolescencia_temprana')
    expect(curriculumRoute(15, 'fundamentos').ageBand).toBe('adolescencia')
    expect(curriculumRoute(18, 'fundamentos').ageBand).toBe('adulto')
  })
  test('prerequisites gate availability', () => {
    expect(curriculumRoute(18, 'fundamentos').nodes[1].status).toBe('pending')
    expect(curriculumRoute(18, 'fundamentos', ['ai-agency']).nodes[1].status).toBe('available')
  })
  test('rejects unsupported ages and unknown evidence', () => {
    for (const age of [7, 121, NaN, 12.5]) expect(() => curriculumRoute(age, 'fundamentos')).toThrow()
    expect(() => curriculumRoute(18, 'fundamentos', ['invented'])).toThrow()
  })
  test('returned data cannot mutate canonical nodes', () => {
    const route = curriculumRoute(18, 'fundamentos')
    route.nodes[0].title = 'changed'
    route.nodes[1].prerequisites.push('invented')
    expect(curriculumRoute(18, 'fundamentos').nodes[0].title).not.toBe('changed')
    expect(curriculumRoute(18, 'fundamentos').nodes[1].prerequisites).toEqual(['ai-agency'])
  })
  test('coordinator receives version and evidence restriction', () => {
    expect(coordinatorCurriculumContext(18)).toContain('No declares dominio sin evidencia validada')
  })
})
