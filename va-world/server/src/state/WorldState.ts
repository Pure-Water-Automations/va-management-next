import { MapSchema, Schema, type } from "@colyseus/schema";

/** One avatar in the world. Identity fields are set once at join. */
export class Player extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") name = "Guest";
  @type("string") tier = "GUEST";
  @type("string") status = "";
  @type("string") vaId = "";
  @type("string") profileUrl = "";
  @type("boolean") isGuest = true;
  @type("string") zone = "world";
}

export class WorldState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}
