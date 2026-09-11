import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllCategories,
    getAllGames,
    getAllGameIds,
    getAllPublishers,
    getGameById,
    getGamesByFilters,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

async function seedMultipleGenres(db: Database): Promise<void> {
    const strategy = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'strategic games' })
        .returning({ id: categories.id });
    const puzzle = await db
        .insert(categories)
        .values({ name: 'Puzzle', description: 'brain teaser games' })
        .returning({ id: categories.id });

    const alpha = await db
        .insert(publishers)
        .values({ name: 'Alpha Studio', description: 'alpha publisher' })
        .returning({ id: publishers.id });
    const beta = await db
        .insert(publishers)
        .values({ name: 'Beta Studio', description: 'beta publisher' })
        .returning({ id: publishers.id });

    const gamesToInsert = [
        { title: 'Apex Tactics', description: 'First', categoryId: strategy[0].id, publisherId: alpha[0].id },
        { title: 'Beacon Logic', description: 'Second', categoryId: puzzle[0].id, publisherId: alpha[0].id },
        { title: 'City Siege', description: 'Third', categoryId: strategy[0].id, publisherId: beta[0].id },
        { title: 'Hidden Levels', description: 'Fourth', categoryId: puzzle[0].id, publisherId: beta[0].id },
    ];

    await db.insert(games).values(gamesToInsert);
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });

    it('filters games by category', async () => {
        await seedMultipleGenres(db);

        const gamesByCategory = await getGamesByFilters(db, { categoryIds: [1] });
        expect(gamesByCategory.map((game) => game.title)).toEqual(['Apex Tactics', 'City Siege']);
    });

    it('filters games by publisher and category together', async () => {
        await seedMultipleGenres(db);

        const filteredGames = await getGamesByFilters(db, {
            categoryIds: [1],
            publisherIds: [1],
        });

        expect(filteredGames.map((game) => game.title)).toEqual(['Apex Tactics']);
    });

    it('returns empty results when no games match the filter', async () => {
        await seedMultipleGenres(db);

        const filteredGames = await getGamesByFilters(db, {
            categoryIds: [999],
            publisherIds: [999],
        });

        expect(filteredGames).toEqual([]);
    });

    it('returns all categories and publishers ordered alphabetically', async () => {
        await seedMultipleGenres(db);

        const categoriesList = await getAllCategories(db);
        const publishersList = await getAllPublishers(db);

        expect(categoriesList.map((category) => category.name)).toEqual(['Puzzle', 'Strategy']);
        expect(publishersList.map((publisher) => publisher.name)).toEqual(['Alpha Studio', 'Beta Studio']);
    });
});
