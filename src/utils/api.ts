const API_BASE_URL = import.meta.env.PUBLIC_API_URL || '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Utility function to create URL-friendly slugs
export function createGameSlug(gameName: string): string {
  return gameName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .trim()
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
    this.token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('token', token);
      } else {
        localStorage.removeItem('token');
      }
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add any additional headers from options
    if (options.headers) {
      const additionalHeaders = options.headers as Record<string, string>;
      Object.assign(headers, additionalHeaders);
    }

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || `HTTP error! status: ${response.status}`,
        };
      }

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  // Auth endpoints
  async login(email: string, password: string) {
    return this.request<{
      token: string;
      user: User;
      message: string;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(userData: RegisterData) {
    return this.request<{
      token: string;
      user: User;
      message: string;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async getCurrentUser() {
    return this.request<{ user: User }>('/auth/me');
  }

  async updateUser(updates: Partial<User>) {
    return this.request<{ user: User }>('/auth/update', {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  }

  // Teams endpoints
  async getTeams() {
    return this.request<{ teams: NFLTeam[] }>('/teams');
  }

  // Games endpoints
  async getGames() {
    return this.request<{ games: PickemGame[] }>('/games');
  }

  async createGame(gameName: string, gameType: 'week' | 'survivor' = 'week') {
    return this.request<{
      game: PickemGame;
      message: string;
    }>('/games', {
      method: 'POST',
      body: JSON.stringify({ gameName, gameType }),
    });
  }

  async getGame(gameId: string) {
    return this.request<{ game: PickemGame & { participants: GameParticipant[] } }>(`/games/${gameId}`);
  }

  async getGameBySlug(gameSlug: string) {
    return this.request<{ game: PickemGame & { participants: GameParticipant[] } }>(`/games/by-slug/${encodeURIComponent(gameSlug)}`);
  }

  async addPlayerToGame(gameId: string, userEmail: string) {
    return this.request<{ 
      message: string; 
      type: 'direct_add' | 'invitation_sent';
      player?: { id: string; email: string };
      email?: string;
    }>(`/games/${gameId}/players`, {
      method: 'POST',
      body: JSON.stringify({ userEmail }),
    });
  }

  async removePlayerFromGame(gameId: string, userId: string) {
    return this.request<{ message: string }>(`/games/${gameId}/players/${userId}`, {
      method: 'DELETE',
    });
  }

  async updateGame(gameId: string, updates: { gameName?: string; gameType?: 'week' | 'survivor' }) {
    return this.request<{ message: string; game: PickemGame }>(`/games/${gameId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteGame(gameId: string) {
    return this.request<{ message: string }>(`/games/${gameId}`, {
      method: 'DELETE',
    });
  }

  async getGameInvitations(gameId: string) {
    return this.request<{ invitations: GameInvitation[] }>(`/games/${gameId}/invitations`);
  }

  async cancelGameInvitation(gameId: string, invitationId: string) {
    return this.request<{ message: string }>(`/games/${gameId}/invitations/${invitationId}`, {
      method: 'DELETE',
    });
  }

  // Seasons endpoints
  async getCurrentSeason() {
    return this.request<{ season: Season }>('/seasons/current');
  }

  async getSeasons() {
    return this.request<{ seasons: Season[] }>('/seasons');
  }

  async getSeasonStatus() {
    return this.request<{ status: SeasonStatus }>('/seasons/status');
  }

  async getSeasonGames(seasonId: string, week?: number) {
    const params = week ? `?week=${week}` : '';
    return this.request<{ games: NFLGame[] }>(`/seasons/${seasonId}/games${params}`);
  }

  // Picks endpoints
  async getUserPicks(params: { gameId?: string; seasonId?: string; week?: number; userId?: string }) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, value.toString());
      }
    });
    
    return this.request<{ picks: Pick[] }>(`/picks?${searchParams}`);
  }

  async makePick(pickData: {
    gameId: string;
    footballGameId: string;
    pickTeamId: string;
    tiebreaker?: number;
  }) {
    return this.request<{
      pick: Pick;
      message: string;
    }>('/picks', {
      method: 'POST',
      body: JSON.stringify(pickData),
    });
  }

  async getPicksSummary(gameId: string, seasonId?: string, week?: number) {
    const params = new URLSearchParams();
    if (seasonId) params.append('seasonId', seasonId);
    if (week) params.append('week', week.toString());
    
    return this.request<{ summary: PicksSummary[] }>(`/picks/game/${gameId}/summary?${params}`);
  }

  // On-demand score updates
  async updateScoresOnDemand(seasonId?: string, week?: number) {
    const body: any = {};
    if (seasonId) body.seasonId = seasonId;
    if (week) body.week = week;

    return this.request<OnDemandUpdateResult>('/admin/update-scores-on-demand', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  async getScoresLastUpdated(seasonId: string, week: number) {
    return this.request<LastUpdateInfo>(`/admin/scores-last-updated/${seasonId}/${week}`);
  }
}

// Types
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  favoriteTeamId?: string;
  isAdmin: boolean;
  emailVerified: boolean;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  favoriteTeamId?: string;
}

export interface NFLTeam {
  id: string;
  team_code: string;
  team_name: string;
  team_city: string;
  team_conference: string;
  team_division: string;
  team_logo?: string;
  team_primary_color?: string;
  team_secondary_color?: string;
}

export interface PickemGame {
  id: string;
  game_name: string;
  game_type: 'week' | 'survivor';
  created_at: string;
  updated_at: string;
  player_count: number;
  owner_count: number;
  user_role?: 'owner' | 'player';
  is_active: boolean;
}

export interface GameParticipant {
  role: 'owner' | 'player';
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  display_name: string;
}

export interface GameInvitation {
  id: string;
  game_id: string;
  email: string;
  status: string;
  invited_by_user_id: string;
  invited_by_name: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface Season {
  id: string;
  season: string;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

export interface SeasonStatus {
  year: string;
  type: number;
  typeText: string;
  week: number;
  isPreseason: boolean;
  isRegularSeason: boolean;
  isPostseason: boolean;
}

export interface NFLGame {
  id: string;
  season_id: string;
  week: number;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  game_date: string;
  start_time: string;
  status: string;
  quarter?: number;
  time_remaining?: number;
  home_team_city: string;
  home_team_name: string;
  home_team_code: string;
  home_team_primary_color?: string;
  away_team_city: string;
  away_team_name: string;
  away_team_code: string;
  away_team_primary_color?: string;
}

export interface Pick {
  id: string;
  user_id: string;
  game_id: string;
  season_id: string;
  week: number;
  football_game_id: string;
  pick_team_id: string;
  is_correct?: boolean;
  tiebreaker?: number;
  created_at: string;
  updated_at: string;
  pick_team_city: string;
  pick_team_name: string;
  pick_team_code: string;
}

export interface PicksSummary {
  user_id: string;
  first_name: string;
  last_name: string;
  total_picks: number;
  correct_picks: number;
  pick_percentage: number;
}

export interface OnDemandUpdateResult {
  updated: boolean;
  reason: string;
  lastUpdate?: string;
  error?: string;
  gamesUpdated?: number;
  gamesCreated?: number;
}

export interface LastUpdateInfo {
  lastUpdate: string | null;
  formatted: string;
  isStale: boolean;
}

export const api = new ApiClient();
export default api;