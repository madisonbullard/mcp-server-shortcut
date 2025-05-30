import { describe, expect, mock, spyOn, test } from "bun:test";
import type { ShortcutClientWrapper } from "@/client/shortcut";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Iteration, Member, Story } from "@shortcut/client";
import { IterationTools } from "./iterations";

describe("IterationTools", () => {
	const mockCurrentUser = {
		id: "user1",
		profile: {
			mention_name: "testuser",
			name: "Test User",
		},
	} as Member;

	const mockMembers: Member[] = [
		mockCurrentUser,
		{
			id: "user2",
			profile: {
				mention_name: "jane",
				name: "Jane Smith",
			},
		} as Member,
	];

	const mockStories: Story[] = [
		{
			id: 123,
			name: "Test Story 1",
			story_type: "feature",
			owner_ids: ["user1"],
		} as Story,
		{
			id: 456,
			name: "Test Story 2",
			story_type: "bug",
			owner_ids: ["user1", "user2"],
		} as Story,
	];

	const mockIterations: Iteration[] = [
		{
			id: 1,
			name: "Iteration 1",
			description: "Description for Iteration 1",
			start_date: "2023-01-01",
			end_date: "2023-01-14",
			status: "started",
			app_url: "https://app.shortcut.com/test/iteration/1",
		} as Iteration,
		{
			id: 2,
			name: "Iteration 2",
			description: "Description for Iteration 2",
			start_date: "2023-01-15",
			end_date: "2023-01-28",
			status: "unstarted",
			app_url: "https://app.shortcut.com/test/iteration/2",
		} as Iteration,
	];

	describe("create method", () => {
		test("should register the correct tools with the server", () => {
			const mockClient = {} as ShortcutClientWrapper;
			const mockTool = mock();
			const mockServer = { tool: mockTool } as unknown as McpServer;

			IterationTools.create(mockClient, mockServer);

			expect(mockTool).toHaveBeenCalledTimes(3);
			expect(mockTool.mock.calls?.[0]?.[0]).toBe("get-iteration-stories");
			expect(mockTool.mock.calls?.[1]?.[0]).toBe("get-iteration");
			expect(mockTool.mock.calls?.[2]?.[0]).toBe("search-iterations");
		});

		test("should call correct function from tool", async () => {
			const mockClient = {} as ShortcutClientWrapper;
			const mockTool = mock();
			const mockServer = { tool: mockTool } as unknown as McpServer;

			const tools = IterationTools.create(mockClient, mockServer);

			spyOn(tools, "getIterationStories").mockImplementation(async () => ({
				content: [{ text: "", type: "text" }],
			}));
			await mockTool.mock.calls?.[0]?.[3]({ iterationPublicId: 1 });
			expect(tools.getIterationStories).toHaveBeenCalledWith(1);

			spyOn(tools, "getIteration").mockImplementation(async () => ({
				content: [{ text: "", type: "text" }],
			}));
			await mockTool.mock.calls?.[1]?.[3]({ iterationPublicId: 1 });
			expect(tools.getIteration).toHaveBeenCalledWith(1);

			spyOn(tools, "searchIterations").mockImplementation(async () => ({
				content: [{ text: "", type: "text" }],
			}));
			await mockTool.mock.calls?.[2]?.[3]({ name: "test" });
			expect(tools.searchIterations).toHaveBeenCalledWith({ name: "test" });
		});
	});

	describe("getIterationStories method", () => {
		const listIterationStoriesMock = mock(async () => ({ stories: mockStories }));
		const getUserMapMock = mock(async (ids: string[]) => {
			const map = new Map<string, Member>();
			for (const id of ids) {
				const member = mockMembers.find((m) => m.id === id);
				if (member) map.set(id, member);
			}
			return map;
		});

		const mockClient = {
			listIterationStories: listIterationStoriesMock,
			getUserMap: getUserMapMock,
		} as unknown as ShortcutClientWrapper;

		test("should return formatted list of stories in an iteration", async () => {
			const iterationTools = new IterationTools(mockClient);
			const result = await iterationTools.getIterationStories(1);

			expect(result.content[0].type).toBe("text");
			expect(String(result.content[0].text).split("\n")).toMatchObject([
				"Result (2 stories found):",
				"- sc-123: Test Story 1 (Type: feature, State: Not Started, Team: [None], Epic: [None], Iteration: [None], Owners: @testuser)",
				"- sc-456: Test Story 2 (Type: bug, State: Not Started, Team: [None], Epic: [None], Iteration: [None], Owners: @testuser, @jane)",
			]);
		});

		test("should throw error when stories are not found", async () => {
			const iterationTools = new IterationTools({
				listIterationStories: mock(async () => ({ stories: null })),
			} as unknown as ShortcutClientWrapper);

			await expect(() => iterationTools.getIterationStories(1)).toThrow(
				"Failed to retrieve Shortcut stories in iteration with public ID: 1.",
			);
		});
	});

	describe("searchIterations method", () => {
		const searchIterationsMock = mock(async () => ({
			iterations: mockIterations,
			total: mockIterations.length,
		}));
		const getCurrentUserMock = mock(async () => mockCurrentUser);

		const mockClient = {
			searchIterations: searchIterationsMock,
			getCurrentUser: getCurrentUserMock,
		} as unknown as ShortcutClientWrapper;

		test("should return formatted list of iterations when iterations are found", async () => {
			const iterationTools = new IterationTools(mockClient);
			const result = await iterationTools.searchIterations({});

			expect(result.content[0].type).toBe("text");
			expect(String(result.content[0].text).split("\n")).toMatchObject([
				"Result (first 2 shown of 2 total iterations found):",
				"- 1: Iteration 1 (Start date: 2023-01-01, End date: 2023-01-14)",
				"- 2: Iteration 2 (Start date: 2023-01-15, End date: 2023-01-28)",
			]);
		});

		test("should return no iterations found message when no iterations exist", async () => {
			const iterationTools = new IterationTools({
				searchIterations: mock(async () => ({ iterations: [], total: 0 })),
				getCurrentUser: getCurrentUserMock,
			} as unknown as ShortcutClientWrapper);

			const result = await iterationTools.searchIterations({});

			expect(result.content[0].type).toBe("text");
			expect(result.content[0].text).toBe("Result: No iterations found.");
		});

		test("should throw error when iterations search fails", async () => {
			const iterationTools = new IterationTools({
				searchIterations: mock(async () => ({ iterations: null, total: 0 })),
				getCurrentUser: getCurrentUserMock,
			} as unknown as ShortcutClientWrapper);

			await expect(() => iterationTools.searchIterations({})).toThrow(
				"Failed to search for iterations matching your query",
			);
		});
	});

	describe("getIteration method", () => {
		const getIterationMock = mock(async (id: number) =>
			mockIterations.find((iteration) => iteration.id === id),
		);

		const mockClient = {
			getIteration: getIterationMock,
		} as unknown as ShortcutClientWrapper;

		test("should return formatted iteration details when iteration is found", async () => {
			const iterationTools = new IterationTools(mockClient);
			const result = await iterationTools.getIteration(1);

			expect(result.content[0].type).toBe("text");
			expect(String(result.content[0].text).split("\n")).toMatchObject([
				"Iteration: 1",
				"Url: https://app.shortcut.com/test/iteration/1",
				"Name: Iteration 1",
				"Start date: 2023-01-01",
				"End date: 2023-01-14",
				"Completed: No",
				"Started: Yes",
				"Team: [None]",
				"",
				"Description:",
				"Description for Iteration 1",
			]);
		});

		test("should handle iteration not found", async () => {
			const iterationTools = new IterationTools({
				getIteration: mock(async () => null),
			} as unknown as ShortcutClientWrapper);

			await expect(() => iterationTools.getIteration(999)).toThrow(
				"Failed to retrieve Shortcut iteration with public ID: 999.",
			);
		});

		test("should handle completed iteration", async () => {
			const iterationTools = new IterationTools({
				getIteration: mock(async () => ({
					...mockIterations[0],
					status: "completed",
				})),
			} as unknown as ShortcutClientWrapper);

			const result = await iterationTools.getIteration(1);

			expect(result.content[0].type).toBe("text");
			expect(result.content[0].text).toContain("Completed: Yes");
			expect(result.content[0].text).toContain("Started: No");
		});
	});
});
