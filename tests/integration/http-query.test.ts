import { buildServer } from "./FastifyAdapter";
import { FastifyRepo } from "./FastifyRepo";

jest.setTimeout(85000);

function makeQueryArgs(
  args: any[] = [],
  options?: { orderBy?: string; limit?: number; skip?: number }
): Record<string, any> {
  const query: Record<string, any> = {};

  args.forEach((arg, idx) => {
    query[idx] = arg;
  });

  if (options?.orderBy) query.orderBy = options.orderBy;
  if (options?.limit !== undefined) query.limit = options.limit.toString();
  if (options?.skip !== undefined) query.skip = options.skip.toString();

  return query;
}

describe.skip("HttpQuery by MethodQueryBuilder", () => {
  let app: ReturnType<typeof buildServer>;

  beforeAll(async () => {
    const repo = new FastifyRepo();
    app = buildServer(repo);
    await app.ready();
    await repo.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Operators", () => {
    it("should filter with Equals", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/query/findByName",
        query: makeQueryArgs(["John Smith"]),
      });
      const result = res.json();
      expect(result.map((r: any) => r.name)).toEqual(["John Smith"]);
    });

    it("should filter with Diff", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/query/findByCountryDiff",
        query: makeQueryArgs(["ON"]),
      });
      const result = res.json();
      expect(result.every((u: any) => u.country !== "ON")).toBe(true);
    });

    it("should filter with GreaterThan and LessThan", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/query/findByAgeGreaterThanAndAgeLessThan",
        query: makeQueryArgs([21, 25]),
      });
      const result = res.json();
      expect(result.every((u: any) => u.age > 21 && u.age < 25)).toBe(true);
    });

    it("should filter with GreaterThanEqual and LessThanEqual", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/query/findByAgeGreaterThanEqualAndAgeLessThanEqual",
        query: makeQueryArgs([22, 24]),
      });
      const result = res.json();
      expect(result.every((u: any) => u.age >= 22 && u.age <= 24)).toBe(true);
    });

    it("should filter with Between", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/query/findByAgeBetween",
        query: makeQueryArgs([25, 35]),
      });
      const result = res.json();
      expect(result.every((u: any) => u.age >= 25 && u.age <= 35)).toBe(true);
    });

    it("should filter with True and False", async () => {
      const activesRes = await app.inject({
        method: "GET",
        url: "/query/findByActive",
        query: makeQueryArgs([true]),
      });
      const actives = activesRes.json();
      expect(actives.every((u: any) => u.active)).toBe(true);

      const inactivesRes = await app.inject({
        method: "GET",
        url: "/query/findByActive",
        query: makeQueryArgs([false]),
      });
      const inactives = inactivesRes.json();
      expect(inactives.every((u: any) => !u.active)).toBe(true);
    });

    it("should filter with Matches (regex)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/query/findByNameMatches",
        query: makeQueryArgs(["^David"]),
      });
      const result = res.json();
      expect(result.every((u: any) => /^David/.test(u.name))).toBe(true);
    });

    it("should filter with Or", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/query/findByNameEqualsOrAgeGreaterThan",
        query: makeQueryArgs(["John Smith", 27]),
      });
      const result = res.json();
      expect(result.some((u: any) => u.name === "John Smith")).toBe(true);
      expect(result.some((u: any) => u.age > 27)).toBe(true);
    });
  });

  describe("OrderBy", () => {
    it("should order by name ascending", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/query/findByActiveOrderByNameAsc",
        query: makeQueryArgs([true], { orderBy: "nameAsc", limit: 100 }),
      });
      const orderByResult = res.json();
      const names = orderByResult.map((r: any) => r.name);
      expect(names).toEqual([...names].sort());

      const noOrderByRes = await app.inject({
        method: "GET",
        url: "/query/findByActive",
        query: makeQueryArgs([true]),
      });
      const noOrderByNames = noOrderByRes.json().map((r: any) => r.name);
      expect(noOrderByNames).not.toEqual(names);
    });

    it("should order by age desc then by country dsc", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/query/findByActive",
        query: makeQueryArgs([true], { orderBy: "ageDesc" }),
      });
      const orderByResult = res.json();

      const sorted = [...orderByResult].sort((a, b) => {
        if (a.age !== b.age) return b.age - a.age;
        return b.country.localeCompare(a.country);
      });

      expect(orderByResult).toEqual(sorted);
    });
  });

  describe("Limit", () => {
    it("should limit the number of results", async () => {
      const allRes = await app.inject({
        method: "GET",
        url: "/query/findByActive",
        query: makeQueryArgs([true]),
      });
      const allResult = allRes.json();
      expect(allResult.length).toBeGreaterThanOrEqual(2);

      const limitRes = await app.inject({
        method: "GET",
        url: "/query/findByActive",
        query: makeQueryArgs([true], { limit: 1 }),
      });
      const limitResult = limitRes.json();
      expect(limitResult.length).toEqual(1);
    });
  });

  describe("Offset", () => {
    let allResult: any[];

    beforeAll(async () => {
      const allRes = await app.inject({
        method: "GET",
        url: "/query/findByActive",
        query: makeQueryArgs([true]),
      });
      allResult = allRes.json();
      expect(allResult.length).toBeGreaterThanOrEqual(3);
    });

    it("should offset the number of results", async () => {
      const offsetRes = await app.inject({
        method: "GET",
        url: "/query/findByActive",
        query: makeQueryArgs([true], { skip: allResult.length - 1 }),
      });
      const offsetResult = offsetRes.json();
      expect(offsetResult.length).toEqual(1);
    });

    describe("should offset and limit the number of results", () => {
      const cases = [
        { limit: 1, offset: 1 },
        { limit: 2, offset: 1 },
        { limit: 2, offset: 3 },
      ];

      cases.forEach(({ limit, offset }) => {
        it(`should return limit=${limit} and offset=${offset}`, async () => {
          const res = await app.inject({
            method: "GET",
            url: "/query/findByActive",
            query: makeQueryArgs([true], { limit, skip: offset }),
          });
          const result = res.json();
          expect(result.length).toBeLessThanOrEqual(limit);
          expect(result).toEqual(allResult.slice(offset, offset + limit));
        });
      });
    });
  });

  describe("Check options availability", () => {
    const cases = [
      {
        name: "orderBy",
        args: [10],
        options: { orderBy: "ageAsc" },
        message: "OrderBy is not allowed for this query",
      },
      {
        name: "limit",
        args: [10],
        options: { limit: 1 },
        message: "Limit is not allowed for this query",
      },
      {
        name: "offset",
        args: [10],
        options: { skip: 1 },
        message: "Offset is not allowed for this query",
      },
    ];

    cases.forEach(({ name, args, options, message }) => {
      it(`should throw if ${name} not allowed`, async () => {
        const res = await app.inject({
          method: "GET",
          url: "/query/findByAgeGreaterThanThenThrows",
          query: makeQueryArgs(args, options),
        });
        const err = res.json();
        expect(err.error).toContain(message);
      });
    });
  });

  describe("Invalid method", () => {
    it("should return 400 if method does not exist", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/query/notExists",
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("Invalid method");
    });
  });
});
