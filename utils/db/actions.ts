import { eq, sql, and, desc } from 'drizzle-orm';
import { db } from './dbConfig';
import { CollectedWastes, Notifications, Reports, Rewards, Transactions, Users } from './schema';

export async function createUser(email: string, name: string) {
    try {
        const [user] = await db.insert(Users).values({ email, name }).returning().execute();
        return user;
    } catch (e) {
        console.error("Error creating user", e);
        return null;
    }
}

export async function getUserByEmail(email: string) {
    try {
        const [user] = await db.select().from(Users).where(eq(Users.email, email)).execute();
        return user;
    } catch (e) {
        console.error("Error fetching user by email", e);
        return null;
    }
}

export async function getUnreadNotifications(userId: number) {
    try {
        return await db
            .select()
            .from(Notifications)
            .where(
                and(
                    eq(Notifications.userId, userId),
                    eq(Notifications.isRead, false)
                )
            ).execute();

    } catch (e) {
        console.error("Error fetching unread notifications", e);
        return null;
    }
}

export async function getUserBalance(userId: number): Promise<number> {
    const transactions = await getRewardTransactions(userId) || [];

    if (!transactions) return 0;

    const balance = transactions.reduce((acc: number, transaction: any) => {
        return transaction.type.startsWith('earned') ? acc + transaction.amount : acc - transaction.amount;
    }, 0);
    return Math.max(balance, 0);
}

export async function getRewardTransactions(userId: number) {
    try {
        const transactions = await db.select({
            id: Transactions.id,
            type: Transactions.type,
            amount: Transactions.amount,
            description: Transactions.description,
            date: Transactions.date
        }).from(Transactions).where(
            eq(
                Transactions.userId,
                userId
            )
        ).orderBy(desc(Transactions.date)).limit(10).execute();
        const formattedTransactions = transactions.map(t => ({
            ...t,
            date: t.date.toISOString().split('T')[0] //YYY-MM-DD
        }))
        return formattedTransactions;
    } catch (e) {
        console.error("Error fetching reward transactions", e);
        return null;
    }
}

export async function markNotificationAsRead(notificationId: number) {
    try {
        await db.update(Notifications).set({ isRead: true }).where(
            eq(
                Notifications.id,
                notificationId
            )
        ).execute()
    } catch (e) {
        console.error("Error marking notification as read", e)
        return null
    }
}

export async function createReport(userId: number, location: string, wasteType: string, amount: string, imageUrl?: string, verificationResult?: any) {
    try {
        const [report] = await db.insert(Reports).values({
            userId, location, wasteType, amount, imageUrl, verificationResult, status: 'pending'
        }).returning().execute();

        const pointsEarned = 10;
        await updateRewardPoints(userId, pointsEarned); //update reward point
        await createTransaction(userId, 'earned_report', pointsEarned, 'Points earned for reporting waste'); //create transaction
        await createNotification(userId, `You have earned ${pointsEarned} points for reporting waste`, 'reward'); //create notification

        return report;
    } catch (e) {
        console.error("Error creating report", e);
    }
}

export async function updateRewardPoints(userId: number, pointsToAdd: number) {
    try {
        const [updatedReward] = await db.update(Rewards).set({
            points: sql`${Rewards.points} + ${pointsToAdd}`
        }).where(eq(Rewards.userId, userId)).returning().execute();
        return updatedReward;
    } catch (e) {
        console.error("Error updating reward points", e)
    }
}

export async function createTransaction(userId: number, type: 'earned_report' | 'earned_collect' | 'redeemed', amount: number, description: string) {
    try {
        const [transaction] = await db.insert(Transactions).values({
            userId, type, amount, description
        }).returning().execute();
        return transaction;
    } catch (e) {
        console.error("Error creating transactions", e);
        throw e;
    }
}

export async function createNotification(userId: number, message: string, type: string) {
    try {
        const [notification] = await db.insert(Notifications).values({
            userId, message, type
        }).returning().execute();
        return notification;
    } catch (e) {
        console.error('Error creating notification', e)
    }
}

export async function getRecentReports(limit: number = 10) {
    try {
        const reports = await db.select().from(Reports).orderBy(desc(Reports.createdAt)).limit(limit).execute();
        return reports;
    } catch (e) {
        console.error("Error fetching recent reports", e)
        return []
    }
}

export async function getAvailablerewards(userId: number) {
    try {
        const userTransactions = await getRewardTransactions(userId);
        const userPoints = userTransactions?.reduce((total: any, transaction: any) => {
            return transaction.type.startWith('earned') ? total + transaction.amount : total - transaction.amount
        }, 0);
        const dbRewards = await db.select({
            id: Rewards.id,
            name: Rewards.name,
            cost: Rewards.points,
            description: Rewards.description,
            collectionInfo: Rewards.collectionInfo
        }).from(Rewards).where(
            eq(Rewards.isAvailable, true)
        ).execute();

        // Combine user points and database rewards
        const allRewards = [
            {
                id: 0, // Use a special ID for user's points
                name: "Your Points",
                cost: userPoints,
                description: "Redeem your earned points",
                collectionInfo: "Points earned from reporting and collecting waste"
            },
            ...dbRewards
        ];
        return allRewards;
    } catch (error) {
        console.error("Error fetching available rewards:", error);
        return [];
    }
}

export async function getWasteCollectionTasks(limit: number = 20) {
    try {
        const tasks = await db
            .select({
                id: Reports.id,
                location: Reports.location,
                wasteType: Reports.wasteType,
                amount: Reports.amount,
                status: Reports.status,
                date: Reports.createdAt,
                collectorId: Reports.collectorId,
            })
            .from(Reports)
            .limit(limit)
            .execute();

        return tasks.map(task => ({
            ...task,
            date: task.date.toISOString().split('T')[0], // Format date as YYYY-MM-DD
        }));
    } catch (error) {
        console.error("Error fetching waste collection tasks:", error);
        return [];
    }
}

export async function updateTaskStatus(reportId: number, newStatus: string, collectorId?: number) {
    try {
        const updateData: any = { status: newStatus };
        if (collectorId !== undefined) {
            updateData.collectorId = collectorId;
        }
        const [updatedReport] = await db
            .update(Reports)
            .set(updateData)
            .where(eq(Reports.id, reportId))
            .returning()
            .execute();
        return updatedReport;
    } catch (error) {
        console.error("Error updating task status:", error);
        throw error;
    }
}

export async function saveReward(userId: number, amount: number) {
    try {
        const [reward] = await db
            .insert(Rewards)
            .values({
                userId,
                name: 'Waste Collection Reward',
                collectionInfo: 'Points earned from waste collection',
                points: amount,
                isAvailable: true,
            })
            .returning()
            .execute();

        // Create a transaction for this reward
        await createTransaction(userId, "earned_collect", amount, 'Points earned for collecting waste');

        return reward;
    } catch (error) {
        console.error("Error saving reward:", error);
        throw error;
    }
}

export async function saveCollectedWaste(reportId: number, collectorId: number, verificationResult: any) {
    try {
        const [collectedWaste] = await db
            .insert(CollectedWastes)
            .values({
                reportId,
                collectorId,
                collectionDate: new Date(),
                status: 'verified',
            })
            .returning()
            .execute();
        return collectedWaste;
    } catch (error) {
        console.error("Error saving collected waste:", error);
        throw error;
    }
}

export async function redeemReward(userId: number, rewardId: number) {
    try {
        const userReward = await getOrCreateReward(userId) as any;

        if (rewardId === 0) {
            // Redeem all points
            const [updatedReward] = await db.update(Rewards)
                .set({
                    points: 0,
                    updatedAt: new Date(),
                })
                .where(eq(Rewards.userId, userId))
                .returning()
                .execute();

            // Create a transaction for this redemption
            await createTransaction(userId, 'redeemed', userReward.points, `Redeemed all points: ${userReward.points}`);

            return updatedReward;
        } else {
            // Existing logic for redeeming specific rewards
            const availableReward = await db.select().from(Rewards).where(eq(Rewards.id, rewardId)).execute();

            if (!userReward || !availableReward[0] || userReward.points < availableReward[0].points) {
                throw new Error("Insufficient points or invalid reward");
            }

            const [updatedReward] = await db.update(Rewards)
                .set({
                    points: sql`${Rewards.points} - ${availableReward[0].points}`,
                    updatedAt: new Date(),
                })
                .where(eq(Rewards.userId, userId))
                .returning()
                .execute();

            // Create a transaction for this redemption
            await createTransaction(userId, 'redeemed', availableReward[0].points, `Redeemed: ${availableReward[0].name}`);

            return updatedReward;
        }
    } catch (error) {
        console.error("Error redeeming reward:", error);
        throw error;
    }
}

export async function getOrCreateReward(userId: number) {
    try {
        let [reward] = await db.select().from(Rewards).where(eq(Rewards.userId, userId)).execute();
        if (!reward) {
            [reward] = await db.insert(Rewards).values({
                userId,
                name: 'Default Reward',
                collectionInfo: 'Default Collection Info',
                points: 0,
                isAvailable: true,
            }).returning().execute();
        }
        return reward;
    } catch (error) {
        console.error("Error getting or creating reward:", error);
        return null;
    }
}