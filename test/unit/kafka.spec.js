const Kafka = require("@platformatic/kafka");
import { describe, expect, it } from "vitest";

it("should be defined", () => {
	expect(Kafka).toBeDefined();
	expect(Kafka.Admin).toBeDefined();
	expect(Kafka.Producer).toBeDefined();
	expect(Kafka.Consumer).toBeDefined();
});
