// Confirmed shape (GET /friends/requests). No fromUserName — resolve the
// sender's profile separately via UserApiService.getUserById(fromUserId).
export interface FriendRequest {
  id: string;
  fromUserId: string;
  updatedAt: string;
}
