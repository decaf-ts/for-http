import {
  BaseModel,
  column,
  OrderBySelector,
  OrderDirection,
  pk,
  query,
  Repository,
  repository,
  table,
  UnsupportedError,
} from "@decaf-ts/core";
import { RamAdapter } from "../../node_modules/@decaf-ts/core/lib/ram/RamAdapter.cjs";
import {
  maxlength,
  min,
  minlength,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";

/* eslint-disable @typescript-eslint/no-unused-vars */

@table("users")
@model()
export class TestUserModel extends BaseModel {
  @pk()
  id!: string;

  @column("name")
  @required()
  name!: string;

  @column("nif")
  // @unique()
  @minlength(9)
  @maxlength(9)
  @required()
  nif!: string;

  @column("age")
  @min(20)
  @required()
  age!: number;

  @column("country")
  // @unique()
  @minlength(2)
  @maxlength(2)
  @required()
  country!: string;

  @column("state")
  // @unique()
  @minlength(2)
  @maxlength(2)
  @required()
  state!: string;

  @column("active")
  @required()
  active!: boolean;

  constructor(arg?: ModelArg<TestUserModel>) {
    super(arg);
  }
}

@repository(TestUserModel)
export class FastifyRepo extends Repository<TestUserModel, any, any, any, any> {
  constructor() {
    super(new RamAdapter(), TestUserModel);
  }

  init() {
    this.select().orderBy(["name", OrderDirection.ASC]).limit(10).offset(10);

    const data = [
      // "John Smith",
      // "Johnathan M. Smith",
      "John Smith",
      "Johnathan Smith",
      "Emily Johnson",
      "Michael Brown",
      "Sarah Davis",
      "David Wilson",
      "Emma Miller",
      "Daniel Taylor",
      "Olivia Anderson",
      "David Smith",
    ].map((name, idx) => {
      return new TestUserModel({
        id: (idx + 1).toString(),
        name,
        country: name.slice(-2).toUpperCase(),
        state: name.slice(0, 2).toUpperCase(),
        nif: Math.random().toString().slice(2, 11),
        age: 20 + idx * 2,
        active: idx % 3 === 0,
      });
    });
    return Repository.forModel(TestUserModel).createAll(data);
  }

  @query()
  findByName(
    name: string,
    orderBy?: OrderBySelector<any>[],
    limit?: number,
    offset?: number
  ): Promise<TestUserModel[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  findByCountryDiff(
    country: string,
    orderBy?: OrderBySelector<any>[],
    limit?: number,
    offset?: number
  ): Promise<TestUserModel[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  findByAgeGreaterThanAndAgeLessThan(
    age1: number,
    age2: number,
    orderBy?: OrderBySelector<any>[],
    limit?: number,
    offset?: number
  ): Promise<TestUserModel[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  findByAgeGreaterThanEqualAndAgeLessThanEqual(
    age1: number,
    age2: number,
    orderBy?: OrderBySelector<any>[],
    limit?: number,
    offset?: number
  ): Promise<TestUserModel[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  findByAgeBetween(
    age1: number,
    age2: number,
    orderBy?: OrderBySelector<any>[],
    limit?: number,
    offset?: number
  ): Promise<TestUserModel[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  async findByActive(
    active: boolean,
    orderBy?: OrderBySelector<any>[],
    limit?: number,
    offset?: number
  ): Promise<TestUserModel[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  findByCountryIn(
    countries: string[],
    orderBy?: OrderBySelector<any>[],
    limit?: number,
    offset?: number
  ): Promise<TestUserModel[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  findByNameEqualsOrAgeGreaterThan(
    name: string,
    age: number,
    orderBy?: OrderBySelector<any>[],
    limit?: number,
    offset?: number
  ): Promise<TestUserModel[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  findByNameMatches(
    name: string,
    orderBy?: OrderBySelector<any>[],
    limit?: number,
    offset?: number
  ): Promise<TestUserModel[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  findByActiveOrderByNameAsc(
    active: boolean,
    orderBy?: OrderBySelector<any>[],
    limit?: number,
    offset?: number
  ): Promise<TestUserModel[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  findByActiveThenSelectNameAndAge(
    active: boolean,
    orderBy?: OrderBySelector<any>[],
    limit?: number,
    offset?: number
  ): Promise<TestUserModel[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query({
    allowOffset: false,
    allowLimit: false,
    allowOrderBy: false,
    throws: true,
  })
  findByAgeGreaterThanThenThrows(
    age: number,
    orderBy?: OrderBySelector<any>[],
    limit?: number,
    offset?: number
  ): Promise<TestUserModel[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }
}
