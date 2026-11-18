import { escapeHtml, resolveDestinationCoords, WAREHOUSE_COORDS } from './geo';

const KANDY = [7.2906, 80.6337];
const GALLE = [6.0535, 80.221];
const FORT = [6.9344, 79.8428];
const BAMBALAPITIYA = [6.8905, 79.8587];
const COLOMBO_03 = [6.9022, 79.8518];

describe('resolveDestinationCoords', () => {
  test('recognises known cities and districts', () => {
    expect(resolveDestinationCoords('120 Peradeniya Road, Kandy', 'Kandy')).toEqual(KANDY);
    expect(resolveDestinationCoords('Fort Rampart', 'Galle')).toEqual(GALLE);
    expect(resolveDestinationCoords('15 Bauddhaloka Mawatha, Colombo 04', 'Colombo')).toEqual(BAMBALAPITIYA);
    expect(resolveDestinationCoords('Main Street, Pettah', 'Colombo')).toEqual(FORT);
  });

  test('"colombo 10" and "colombo 15" are not mistaken for "colombo 1"', () => {
    expect(resolveDestinationCoords('Maradana Rd, Colombo 10', 'Colombo')).toEqual(COLOMBO_03);
    expect(resolveDestinationCoords('Mutwal, Colombo 15', 'Colombo')).toEqual(COLOMBO_03);
    expect(resolveDestinationCoords('Union Place, Colombo 01', 'Colombo')).toEqual(FORT);
    expect(resolveDestinationCoords('Union Place, Colombo 1', '')).toEqual(FORT);
  });

  test('"Colombo 14" / "Colombo 40" do not match the 4 or 7 districts', () => {
    expect(resolveDestinationCoords('Grandpass, Colombo 14', '')).toEqual(COLOMBO_03);
    expect(resolveDestinationCoords('Somewhere, Colombo 70', '')).toEqual(COLOMBO_03);
  });

  test('Galle Road in Colombo is not the city of Galle', () => {
    expect(resolveDestinationCoords('42 Galle Road, Colombo 03', 'Colombo')).toEqual(COLOMBO_03);
    expect(resolveDestinationCoords('42 Galle Road, Galle', 'Galle')).toEqual(GALLE);
  });

  test('"fort" only matches as a whole word', () => {
    expect(resolveDestinationCoords('12 Comfort Lane', '')).toEqual(COLOMBO_03);
  });

  test('tolerates missing input and falls back to Colombo 03', () => {
    expect(resolveDestinationCoords()).toEqual(COLOMBO_03);
    expect(resolveDestinationCoords(null, undefined)).toEqual(COLOMBO_03);
    expect(WAREHOUSE_COORDS).toHaveLength(2);
  });
});

describe('escapeHtml', () => {
  test('neutralises markup', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
    );
    expect(escapeHtml(`Tom & "Jerry's"`)).toBe('Tom &amp; &quot;Jerry&#39;s&quot;');
  });

  test('handles empty values', () => {
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
});
