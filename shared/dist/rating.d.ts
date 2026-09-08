export interface Rating {
    id: string;
    raterId: string;
    ratedUserId: string;
    transactionId: string;
    stars: number;
    comment: string | null;
    createdAt: string;
}
export interface CreateRatingInput {
    stars: number;
    comment?: string;
}
export interface RatingSummaryComment {
    stars: number;
    comment: string;
    createdAt: string;
}
export interface RatingSummary {
    averageStars: number | null;
    totalRatings: number;
    recentComments: RatingSummaryComment[];
}
