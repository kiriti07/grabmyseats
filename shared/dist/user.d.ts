export interface User {
    id: string;
    phone: string;
    name: string | null;
    trustScore: number;
    strikes: number;
    createdAt: string;
    profileImageUrl: string | null;
    email: string | null;
    fullName: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    address: string | null;
    hasWhatsapp: boolean;
}
export interface UpdateProfileInput {
    fullName: string;
    email?: string;
    dateOfBirth?: string;
    gender?: string;
    address?: string;
    hasWhatsapp: boolean;
}
export interface SellerDeliveryEligibility {
    emailForwardEligible: boolean;
    completedSales: number;
    requiredCompletedSales: number;
    hasUnresolvedReviewFlags: boolean;
}
