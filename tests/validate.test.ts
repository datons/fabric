import { describe, expect, it } from 'bun:test';
import { REQUIRED, header, headerProblems, namedParams, resultProblems } from '../skills/lakehouse/scripts/lib.ts';

const GOOD = `-- description: energía diaria por unidad
-- params: unidad, desde
-- example: U1, 2026-01-01
-- grain: una fila por fecha y programa
-- validated: pendiente
-- reviewer: equipo de datos
SELECT fecha, programa, SUM(energia) FROM [dbo].[t] WHERE unidad = ? AND fecha >= ? GROUP BY fecha, programa
`;

describe('same rules as validate.py', () => {
	it('reads the header up to the first SQL line', () => {
		const meta = header(GOOD + '-- trailing: ignored\n');
		expect(meta.grain).toBe('una fila por fecha y programa');
		expect(meta.trailing).toBeUndefined();
	});

	it('passes a complete header and reports missing keys or a parameter mismatch', () => {
		expect(headerProblems(GOOD, header(GOOD))).toEqual([]);
		expect(headerProblems('SELECT 1', {})).toEqual(REQUIRED.map((k) => `falta '${k}' en la cabecera`));
		const bad = GOOD.replace('-- example: U1, 2026-01-01', '-- example: U1');
		expect(headerProblems(bad, header(bad))[0]).toContain('example tiene 1 valores');
	});

	it('fails on an empty result or a duplicated grain', () => {
		const meta = header(GOOD);
		const cols = ['fecha', 'programa', 'energia'];
		expect(resultProblems(meta, cols, [])).toEqual(['no devuelve filas con los parámetros de example']);
		expect(resultProblems(meta, cols, [['2026-01-01', 'A', 1], ['2026-01-01', 'A', 2]])).toEqual(['filas duplicadas para el grano (fecha, programa)']);
		expect(resultProblems(meta, cols, [['2026-01-01', 'A', 1], ['2026-01-01', 'B', 2]])).toEqual([]);
	});
});

describe('named parameters for Tedious', () => {
	it('numbers each ? and skips quotes, brackets and comments', () => {
		const { sql, count } = namedParams("-- why?\nSELECT '?' AS q, [a?b] FROM t WHERE x = ? AND y = ?");
		expect(count).toBe(2);
		expect(sql).toBe("-- why?\nSELECT '?' AS q, [a?b] FROM t WHERE x = @p1 AND y = @p2");
	});

	it('counts only real placeholders when checking the header', () => {
		expect(headerProblems(GOOD.replace('SELECT fecha', "SELECT '¿?' AS nota, fecha"), header(GOOD))).toEqual([]);
	});
});
