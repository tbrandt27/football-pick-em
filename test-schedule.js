import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import db from "./server/models/database.js";
import { seedTeams } from "./server/utils/seedTeams.js";

// Test data configuration
const CURRENT_WEEK = 8; // Mid-season week
const SEASON_YEAR = "2024";

// Sample NFL schedule for testing (Week 1-10)
const testSchedule = [
  // Week 1 (completed)
  {
    week: 1,
    games: [
      {
        home: "KC",
        away: "DET",
        homeScore: 21,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
      {
        home: "BUF",
        away: "NYJ",
        homeScore: 22,
        awayScore: 16,
        status: "STATUS_FINAL",
      },
      {
        home: "PHI",
        away: "NE",
        homeScore: 25,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
      {
        home: "PIT",
        away: "ATL",
        homeScore: 18,
        awayScore: 10,
        status: "STATUS_FINAL",
      },
      {
        home: "HOU",
        away: "IND",
        homeScore: 29,
        awayScore: 27,
        status: "STATUS_FINAL",
      },
      {
        home: "NO",
        away: "CAR",
        homeScore: 47,
        awayScore: 10,
        status: "STATUS_FINAL",
      },
      {
        home: "CIN",
        away: "CLE",
        homeScore: 24,
        awayScore: 3,
        status: "STATUS_FINAL",
      },
      {
        home: "JAX",
        away: "MIA",
        homeScore: 20,
        awayScore: 17,
        status: "STATUS_FINAL",
      },
      {
        home: "LAR",
        away: "SEA",
        homeScore: 30,
        awayScore: 13,
        status: "STATUS_FINAL",
      },
      {
        home: "SF",
        away: "CHI",
        homeScore: 19,
        awayScore: 10,
        status: "STATUS_FINAL",
      },
      {
        home: "TB",
        away: "WAS",
        homeScore: 37,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
      {
        home: "GB",
        away: "MIN",
        homeScore: 7,
        awayScore: 24,
        status: "STATUS_FINAL",
      },
      {
        home: "TEN",
        away: "BAL",
        homeScore: 10,
        awayScore: 27,
        status: "STATUS_FINAL",
      },
      {
        home: "LAC",
        away: "LV",
        homeScore: 22,
        awayScore: 10,
        status: "STATUS_FINAL",
      },
      {
        home: "DAL",
        away: "NYG",
        homeScore: 40,
        awayScore: 0,
        status: "STATUS_FINAL",
      },
      {
        home: "DEN",
        away: "ARI",
        homeScore: 16,
        awayScore: 28,
        status: "STATUS_FINAL",
      },
    ],
  },
  // Week 2 (completed)
  {
    week: 2,
    games: [
      {
        home: "NYJ",
        away: "TEN",
        homeScore: 24,
        awayScore: 17,
        status: "STATUS_FINAL",
      },
      {
        home: "IND",
        away: "HOU",
        homeScore: 31,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
      {
        home: "SEA",
        away: "NE",
        homeScore: 23,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
      {
        home: "NYG",
        away: "WAS",
        homeScore: 21,
        awayScore: 18,
        status: "STATUS_FINAL",
      },
      {
        home: "CLE",
        away: "JAX",
        homeScore: 18,
        awayScore: 13,
        status: "STATUS_FINAL",
      },
      {
        home: "LAC",
        away: "CAR",
        homeScore: 26,
        awayScore: 3,
        status: "STATUS_FINAL",
      },
      {
        home: "LV",
        away: "BAL",
        homeScore: 26,
        awayScore: 23,
        status: "STATUS_FINAL",
      },
      {
        home: "TB",
        away: "DET",
        homeScore: 16,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
      {
        home: "MIN",
        away: "SF",
        homeScore: 17,
        awayScore: 23,
        status: "STATUS_FINAL",
      },
      {
        home: "ARI",
        away: "LAR",
        homeScore: 41,
        awayScore: 10,
        status: "STATUS_FINAL",
      },
      {
        home: "ATL",
        away: "PHI",
        homeScore: 18,
        awayScore: 22,
        status: "STATUS_FINAL",
      },
      {
        home: "MIA",
        away: "BUF",
        homeScore: 10,
        awayScore: 31,
        status: "STATUS_FINAL",
      },
      {
        home: "DAL",
        away: "NO",
        homeScore: 19,
        awayScore: 12,
        status: "STATUS_FINAL",
      },
      {
        home: "KC",
        away: "CIN",
        homeScore: 26,
        awayScore: 25,
        status: "STATUS_FINAL",
      },
      {
        home: "CHI",
        away: "DEN",
        homeScore: 28,
        awayScore: 31,
        status: "STATUS_FINAL",
      },
      {
        home: "GB",
        away: "PIT",
        homeScore: 19,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
    ],
  },
  // Week 3 (completed)
  {
    week: 3,
    games: [
      {
        home: "WAS",
        away: "CIN",
        homeScore: 38,
        awayScore: 33,
        status: "STATUS_FINAL",
      },
      {
        home: "CAR",
        away: "LV",
        homeScore: 22,
        awayScore: 36,
        status: "STATUS_FINAL",
      },
      {
        home: "DET",
        away: "ARI",
        homeScore: 20,
        awayScore: 13,
        status: "STATUS_FINAL",
      },
      {
        home: "NE",
        away: "NYJ",
        homeScore: 15,
        awayScore: 24,
        status: "STATUS_FINAL",
      },
      {
        home: "PHI",
        away: "TB",
        homeScore: 25,
        awayScore: 11,
        status: "STATUS_FINAL",
      },
      {
        home: "HOU",
        away: "JAX",
        homeScore: 24,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
      {
        home: "NO",
        away: "GB",
        homeScore: 18,
        awayScore: 17,
        status: "STATUS_FINAL",
      },
      {
        home: "CHI",
        away: "IND",
        homeScore: 21,
        awayScore: 16,
        status: "STATUS_FINAL",
      },
      {
        home: "PIT",
        away: "LAC",
        homeScore: 20,
        awayScore: 10,
        status: "STATUS_FINAL",
      },
      {
        home: "TEN",
        away: "MIA",
        homeScore: 24,
        awayScore: 27,
        status: "STATUS_FINAL",
      },
      {
        home: "SF",
        away: "LAR",
        homeScore: 27,
        awayScore: 24,
        status: "STATUS_FINAL",
      },
      {
        home: "ATL",
        away: "KC",
        homeScore: 17,
        awayScore: 22,
        status: "STATUS_FINAL",
      },
      {
        home: "CLE",
        away: "NYG",
        homeScore: 21,
        awayScore: 15,
        status: "STATUS_FINAL",
      },
      {
        home: "BAL",
        away: "DAL",
        homeScore: 28,
        awayScore: 25,
        status: "STATUS_FINAL",
      },
      {
        home: "DEN",
        away: "BUF",
        homeScore: 15,
        awayScore: 38,
        status: "STATUS_FINAL",
      },
      {
        home: "SEA",
        away: "MIN",
        homeScore: 21,
        awayScore: 24,
        status: "STATUS_FINAL",
      },
    ],
  },
  // Week 4 (completed)
  {
    week: 4,
    games: [
      {
        home: "BUF",
        away: "BAL",
        homeScore: 35,
        awayScore: 10,
        status: "STATUS_FINAL",
      },
      {
        home: "CIN",
        away: "CAR",
        homeScore: 34,
        awayScore: 24,
        status: "STATUS_FINAL",
      },
      {
        home: "IND",
        away: "PIT",
        homeScore: 27,
        awayScore: 24,
        status: "STATUS_FINAL",
      },
      {
        home: "JAX",
        away: "ATL",
        homeScore: 7,
        awayScore: 21,
        status: "STATUS_FINAL",
      },
      {
        home: "NO",
        away: "TB",
        homeScore: 51,
        awayScore: 27,
        status: "STATUS_FINAL",
      },
      {
        home: "LAR",
        away: "CHI",
        homeScore: 24,
        awayScore: 18,
        status: "STATUS_FINAL",
      },
      {
        home: "NYG",
        away: "SEA",
        homeScore: 29,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
      {
        home: "WAS",
        away: "ARI",
        homeScore: 42,
        awayScore: 14,
        status: "STATUS_FINAL",
      },
      {
        home: "GB",
        away: "MIN",
        homeScore: 31,
        awayScore: 29,
        status: "STATUS_FINAL",
      },
      {
        home: "TEN",
        away: "MIA",
        homeScore: 31,
        awayScore: 12,
        status: "STATUS_FINAL",
      },
      {
        home: "SF",
        away: "NE",
        homeScore: 30,
        awayScore: 13,
        status: "STATUS_FINAL",
      },
      {
        home: "LAC",
        away: "KC",
        homeScore: 17,
        awayScore: 31,
        status: "STATUS_FINAL",
      },
      {
        home: "LV",
        away: "CLE",
        homeScore: 20,
        awayScore: 16,
        status: "STATUS_FINAL",
      },
      {
        home: "NYJ",
        away: "DEN",
        homeScore: 10,
        awayScore: 31,
        status: "STATUS_FINAL",
      },
      {
        home: "DAL",
        away: "DET",
        homeScore: 9,
        awayScore: 47,
        status: "STATUS_FINAL",
      },
      {
        home: "PHI",
        away: "HOU",
        homeScore: 29,
        awayScore: 17,
        status: "STATUS_FINAL",
      },
    ],
  },
  // Week 5 (completed)
  {
    week: 5,
    games: [
      {
        home: "ATL",
        away: "TB",
        homeScore: 36,
        awayScore: 30,
        status: "STATUS_FINAL",
      },
      {
        home: "BAL",
        away: "CIN",
        homeScore: 41,
        awayScore: 38,
        status: "STATUS_FINAL",
      },
      {
        home: "CAR",
        away: "CHI",
        homeScore: 13,
        awayScore: 36,
        status: "STATUS_FINAL",
      },
      {
        home: "BUF",
        away: "HOU",
        homeScore: 23,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
      {
        home: "MIA",
        away: "NE",
        homeScore: 15,
        awayScore: 10,
        status: "STATUS_FINAL",
      },
      {
        home: "CLE",
        away: "WAS",
        homeScore: 34,
        awayScore: 13,
        status: "STATUS_FINAL",
      },
      {
        home: "IND",
        away: "JAX",
        homeScore: 37,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
      {
        home: "LV",
        away: "DEN",
        homeScore: 34,
        awayScore: 18,
        status: "STATUS_FINAL",
      },
      {
        home: "ARI",
        away: "SF",
        homeScore: 24,
        awayScore: 23,
        status: "STATUS_FINAL",
      },
      {
        home: "LAR",
        away: "GB",
        homeScore: 3,
        awayScore: 24,
        status: "STATUS_FINAL",
      },
      {
        home: "SEA",
        away: "NYG",
        homeScore: 29,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
      {
        home: "MIN",
        away: "NYJ",
        homeScore: 23,
        awayScore: 17,
        status: "STATUS_FINAL",
      },
      {
        home: "DAL",
        away: "PIT",
        homeScore: 17,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
      {
        home: "NO",
        away: "KC",
        homeScore: 32,
        awayScore: 29,
        status: "STATUS_FINAL",
      },
      {
        home: "PHI",
        away: "LAC",
        homeScore: 15,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
      {
        home: "DET",
        away: "TEN",
        homeScore: 52,
        awayScore: 14,
        status: "STATUS_FINAL",
      },
    ],
  },
  // Week 6 (completed)
  {
    week: 6,
    games: [
      {
        home: "JAX",
        away: "CHI",
        homeScore: 35,
        awayScore: 16,
        status: "STATUS_FINAL",
      },
      {
        home: "WAS",
        away: "BAL",
        homeScore: 30,
        awayScore: 23,
        status: "STATUS_FINAL",
      },
      {
        home: "HOU",
        away: "NE",
        homeScore: 41,
        awayScore: 21,
        status: "STATUS_FINAL",
      },
      {
        home: "TB",
        away: "NO",
        homeScore: 51,
        awayScore: 27,
        status: "STATUS_FINAL",
      },
      {
        home: "CIN",
        away: "NYG",
        homeScore: 17,
        awayScore: 7,
        status: "STATUS_FINAL",
      },
      {
        home: "IND",
        away: "TEN",
        homeScore: 20,
        awayScore: 17,
        status: "STATUS_FINAL",
      },
      {
        home: "CLE",
        away: "PHI",
        homeScore: 20,
        awayScore: 16,
        status: "STATUS_FINAL",
      },
      {
        home: "LAC",
        away: "DEN",
        homeScore: 23,
        awayScore: 16,
        status: "STATUS_FINAL",
      },
      {
        home: "ARI",
        away: "GB",
        homeScore: 24,
        awayScore: 10,
        status: "STATUS_FINAL",
      },
      {
        home: "ATL",
        away: "CAR",
        homeScore: 38,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
      {
        home: "LV",
        away: "PIT",
        homeScore: 32,
        awayScore: 13,
        status: "STATUS_FINAL",
      },
      {
        home: "SF",
        away: "SEA",
        homeScore: 36,
        awayScore: 24,
        status: "STATUS_FINAL",
      },
      {
        home: "DAL",
        away: "DET",
        homeScore: 9,
        awayScore: 47,
        status: "STATUS_FINAL",
      },
      {
        home: "BUF",
        away: "NYJ",
        homeScore: 23,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
      {
        home: "KC",
        away: "LAR",
        homeScore: 26,
        awayScore: 10,
        status: "STATUS_FINAL",
      },
      {
        home: "MIN",
        away: "MIA",
        homeScore: 24,
        awayScore: 16,
        status: "STATUS_FINAL",
      },
    ],
  },
  // Week 7 (completed)
  {
    week: 7,
    games: [
      {
        home: "DEN",
        away: "NO",
        homeScore: 33,
        awayScore: 10,
        status: "STATUS_FINAL",
      },
      {
        home: "SEA",
        away: "ATL",
        homeScore: 34,
        awayScore: 14,
        status: "STATUS_FINAL",
      },
      {
        home: "TEN",
        away: "BUF",
        homeScore: 34,
        awayScore: 10,
        status: "STATUS_FINAL",
      },
      {
        home: "CLE",
        away: "CIN",
        homeScore: 21,
        awayScore: 14,
        status: "STATUS_FINAL",
      },
      {
        home: "MIA",
        away: "IND",
        homeScore: 16,
        awayScore: 10,
        status: "STATUS_FINAL",
      },
      {
        home: "HOU",
        away: "GB",
        homeScore: 24,
        awayScore: 22,
        status: "STATUS_FINAL",
      },
      {
        home: "DET",
        away: "MIN",
        homeScore: 31,
        awayScore: 29,
        status: "STATUS_FINAL",
      },
      {
        home: "JAX",
        away: "NE",
        homeScore: 32,
        awayScore: 16,
        status: "STATUS_FINAL",
      },
      {
        home: "WAS",
        away: "CAR",
        homeScore: 40,
        awayScore: 7,
        status: "STATUS_FINAL",
      },
      {
        home: "TB",
        away: "BAL",
        homeScore: 41,
        awayScore: 31,
        status: "STATUS_FINAL",
      },
      {
        home: "LAR",
        away: "LV",
        homeScore: 20,
        awayScore: 15,
        status: "STATUS_FINAL",
      },
      {
        home: "PHI",
        away: "NYG",
        homeScore: 28,
        awayScore: 3,
        status: "STATUS_FINAL",
      },
      {
        home: "KC",
        away: "SF",
        homeScore: 28,
        awayScore: 18,
        status: "STATUS_FINAL",
      },
      {
        home: "NYJ",
        away: "PIT",
        homeScore: 37,
        awayScore: 15,
        status: "STATUS_FINAL",
      },
      {
        home: "LAC",
        away: "ARI",
        homeScore: 17,
        awayScore: 15,
        status: "STATUS_FINAL",
      },
      {
        home: "CHI",
        away: "DAL",
        homeScore: 27,
        awayScore: 26,
        status: "STATUS_FINAL",
      },
    ],
  },
  // Week 8 (current week - all completed for testing)
  {
    week: 8,
    games: [
      {
        home: "BAL",
        away: "CLE",
        homeScore: 29,
        awayScore: 24,
        status: "STATUS_FINAL",
      },
      {
        home: "ATL",
        away: "TB",
        homeScore: 31,
        awayScore: 26,
        status: "STATUS_FINAL",
      },
      {
        home: "BUF",
        away: "SEA",
        homeScore: 31,
        awayScore: 10,
        status: "STATUS_FINAL",
      },
      {
        home: "CIN",
        away: "PHI",
        homeScore: 37,
        awayScore: 17,
        status: "STATUS_FINAL",
      },
      {
        home: "DET",
        away: "TEN",
        homeScore: 52,
        awayScore: 14,
        status: "STATUS_FINAL",
      },
      {
        home: "GB",
        away: "JAX",
        homeScore: 30,
        awayScore: 27,
        status: "STATUS_FINAL",
      },
      {
        home: "HOU",
        away: "IND",
        homeScore: 23,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
      {
        home: "MIA",
        away: "ARI",
        homeScore: 28,
        awayScore: 27,
        status: "STATUS_FINAL",
      },
      {
        home: "MIN",
        away: "LAR",
        homeScore: 30,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
      {
        home: "NO",
        away: "LAC",
        homeScore: 26,
        awayScore: 8,
        status: "STATUS_FINAL",
      },
      {
        home: "NYG",
        away: "PIT",
        homeScore: 26,
        awayScore: 18,
        status: "STATUS_FINAL",
      },
      {
        home: "WAS",
        away: "CHI",
        homeScore: 18,
        awayScore: 15,
        status: "STATUS_FINAL",
      },
      {
        home: "SF",
        away: "DAL",
        homeScore: 30,
        awayScore: 24,
        status: "STATUS_FINAL",
      },
      {
        home: "DEN",
        away: "CAR",
        homeScore: 28,
        awayScore: 14,
        status: "STATUS_FINAL",
      },
      {
        home: "KC",
        away: "LV",
        homeScore: 27,
        awayScore: 20,
        status: "STATUS_FINAL",
      },
      {
        home: "NYJ",
        away: "NE",
        homeScore: 25,
        awayScore: 22,
        status: "STATUS_FINAL",
      },
    ],
  },
  // Week 9 (upcoming - all scheduled)
  {
    week: 9,
    games: [
      {
        home: "CHI",
        away: "ARI",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "NE",
        away: "TEN",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "NO",
        away: "CAR",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "LV",
        away: "CIN",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "MIA",
        away: "BUF",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "WAS",
        away: "NYG",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "DEN",
        away: "BAL",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "LAC",
        away: "CLE",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "ATL",
        away: "DAL",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "JAX",
        away: "PHI",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "DET",
        away: "GB",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "LAR",
        away: "SEA",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "TB",
        away: "KC",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "IND",
        away: "MIN",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "NYJ",
        away: "HOU",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "SF",
        away: "PIT",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
    ],
  },
  // Week 10 (upcoming - all scheduled)
  {
    week: 10,
    games: [
      {
        home: "CAR",
        away: "NYG",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "NE",
        away: "CHI",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "BUF",
        away: "IND",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "MIN",
        away: "JAX",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "ATL",
        away: "NO",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "BAL",
        away: "CIN",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "SF",
        away: "TB",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "DEN",
        away: "KC",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "PIT",
        away: "WAS",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "PHI",
        away: "DAL",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "ARI",
        away: "NYJ",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "LAC",
        away: "TEN",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "SEA",
        away: "LAR",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "DET",
        away: "HOU",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "MIA",
        away: "LV",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
      {
        home: "GB",
        away: "CLE",
        homeScore: 0,
        awayScore: 0,
        status: "STATUS_SCHEDULED",
      },
    ],
  },
];

// Test users data
const testUsers = [
  {
    email: "john.doe@example.com",
    firstName: "John",
    lastName: "Doe",
    favoriteTeam: "KC",
  },
  {
    email: "jane.smith@example.com",
    firstName: "Jane",
    lastName: "Smith",
    favoriteTeam: "BUF",
  },
  {
    email: "mike.wilson@example.com",
    firstName: "Mike",
    lastName: "Wilson",
    favoriteTeam: "SF",
  },
  {
    email: "sarah.johnson@example.com",
    firstName: "Sarah",
    lastName: "Johnson",
    favoriteTeam: "DAL",
  },
  {
    email: "david.brown@example.com",
    firstName: "David",
    lastName: "Brown",
    favoriteTeam: "GB",
  },
  {
    email: "lisa.davis@example.com",
    firstName: "Lisa",
    lastName: "Davis",
    favoriteTeam: "NE",
  },
  {
    email: "tom.miller@example.com",
    firstName: "Tom",
    lastName: "Miller",
    favoriteTeam: "PIT",
  },
  {
    email: "amy.garcia@example.com",
    firstName: "Amy",
    lastName: "Garcia",
    favoriteTeam: "LAR",
  },
];

// Generate realistic picks for users (some good, some bad pickers)
const generateUserPicks = (userId, userIndex, weekData, teams, nflGames) => {
  const picks = [];
  const userSkill =
    [0.75, 0.65, 0.55, 0.7, 0.6, 0.5, 0.45, 0.68][userIndex] || 0.6; // Win percentage

  weekData.games.forEach((game, gameIndex) => {
    // Only generate picks for completed games
    if (game.status === "STATUS_FINAL") {
      const homeTeam = teams.find((t) => t.team_code === game.home);
      const awayTeam = teams.find((t) => t.team_code === game.away);
      const nflGame = nflGames.find(
        (g) =>
          g.home_team_id === homeTeam?.id &&
          g.away_team_id === awayTeam?.id &&
          g.week === weekData.week
      );

      if (homeTeam && awayTeam && nflGame) {
        // Determine the actual winner
        const actualWinner =
          game.homeScore > game.awayScore ? homeTeam.id : awayTeam.id;

        // User picks based on their skill level
        let userPick;
        if (Math.random() < userSkill) {
          // Pick the winner
          userPick = actualWinner;
        } else {
          // Pick the loser
          userPick =
            game.homeScore > game.awayScore ? awayTeam.id : homeTeam.id;
        }

        // Add some tiebreakers for certain games
        let tiebreaker = null;
        if (gameIndex === 0) {
          // First game of the week gets tiebreaker
          const totalPoints = game.homeScore + game.awayScore;
          // Add some variance to the tiebreaker guess
          tiebreaker = totalPoints + Math.floor(Math.random() * 21) - 10; // ±10 points
        }

        picks.push({
          userId,
          nflGameId: nflGame.id,
          pickTeamId: userPick,
          isCorrect: userPick === actualWinner,
          tiebreaker,
          week: weekData.week,
        });
      }
    }
  });

  return picks;
};

async function createTestSchedule() {
  console.log("🏈 Creating NFL Pick'em Test Schedule...\n");

  try {
    // 1. Seed NFL teams first
    console.log("📋 Seeding NFL teams...");
    await seedTeams();
    console.log("✅ NFL teams seeded successfully\n");

    // Get all teams for reference
    const teams = await db.all("SELECT * FROM nfl_teams");
    const teamMap = {};
    teams.forEach((team) => {
      teamMap[team.team_code] = team;
    });

    // 2. Create season
    console.log("🗓️  Creating test season...");

    // First check if season already exists
    let existingSeason = await db.get(
      "SELECT id FROM seasons WHERE season = ?",
      [SEASON_YEAR]
    );
    let seasonId;

    if (existingSeason) {
      seasonId = existingSeason.id;
      console.log(`ℹ️  Using existing ${SEASON_YEAR} season\n`);
    } else {
      seasonId = uuidv4();
      await db.run(
        `
        INSERT INTO seasons (id, season, is_current)
        VALUES (?, ?, 1)
      `,
        [seasonId, SEASON_YEAR]
      );
      console.log(`✅ Created ${SEASON_YEAR} season\n`);
    }

    // 3. Create test users
    console.log("👥 Creating test users...");
    const userIds = [];

    for (const userData of testUsers) {
      // Check if user already exists
      const existingUser = await db.get(
        "SELECT id FROM users WHERE email = ?",
        [userData.email]
      );
      let userId;

      if (existingUser) {
        userId = existingUser.id;
        console.log(
          `   Using existing user: ${userData.firstName} ${userData.lastName} (${userData.email})`
        );
      } else {
        userId = uuidv4();
        const hashedPassword = await bcrypt.hash("password123", 12);
        const favoriteTeam = teams.find(
          (t) => t.team_code === userData.favoriteTeam
        );

        await db.run(
          `
          INSERT INTO users (
            id, email, password, first_name, last_name,
            favorite_team_id, is_admin, email_verified
          ) VALUES (?, ?, ?, ?, ?, ?, 0, 1)
        `,
          [
            userId,
            userData.email,
            hashedPassword,
            userData.firstName,
            userData.lastName,
            favoriteTeam?.id || null,
          ]
        );
        console.log(
          `   Created user: ${userData.firstName} ${userData.lastName} (${userData.email})`
        );
      }

      userIds.push(userId);
    }
    console.log(`✅ Processed ${testUsers.length} test users\n`);

    // 4. Create NFL games for each week
    console.log("🏟️  Creating NFL games...");
    const allNflGames = [];

    for (const weekData of testSchedule) {
      console.log(`   Creating Week ${weekData.week} games...`);

      for (const game of weekData.games) {
        const homeTeam = teamMap[game.home];
        const awayTeam = teamMap[game.away];

        if (homeTeam && awayTeam) {
          const gameId = uuidv4();
          const gameDate = new Date(2024, 8, (weekData.week - 1) * 7 + 1); // September start
          const startTime = new Date(
            gameDate.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000
          ); // Random time during week

          await db.run(
            `
            INSERT OR REPLACE INTO nfl_games (
              id, season_id, week, home_team_id, away_team_id,
              home_score, away_score, game_date, start_time, status,
              season_type, scores_updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, CURRENT_TIMESTAMP)
          `,
            [
              gameId,
              seasonId,
              weekData.week,
              homeTeam.id,
              awayTeam.id,
              game.homeScore,
              game.awayScore,
              gameDate.toISOString(),
              startTime.toISOString(),
              game.status,
            ]
          );

          allNflGames.push({
            id: gameId,
            week: weekData.week,
            home_team_id: homeTeam.id,
            away_team_id: awayTeam.id,
            status: game.status,
          });
        }
      }
    }
    console.log(`✅ Created ${allNflGames.length} NFL games\n`);

    // 5. Create test pick'em games
    console.log("🎮 Creating pick'em games...");
    const pickemGames = [
      { name: "Family League 2024", type: "week", commissioner: 0 },
      { name: "Office Pool", type: "week", commissioner: 1 },
      { name: "Survivor Challenge", type: "survivor", commissioner: 2 },
    ];

    const pickemGameIds = [];

    for (let i = 0; i < pickemGames.length; i++) {
      const gameData = pickemGames[i];
      const gameId = uuidv4();
      const commissionerId = userIds[gameData.commissioner];

      // Verify commissioner exists
      const commissionerExists = await db.get(
        "SELECT id FROM users WHERE id = ?",
        [commissionerId]
      );
      if (!commissionerExists) {
        throw new Error(`Commissioner user not found: ${commissionerId}`);
      }

      // Verify season exists
      const seasonExists = await db.get("SELECT id FROM seasons WHERE id = ?", [
        seasonId,
      ]);
      if (!seasonExists) {
        throw new Error(`Season not found: ${seasonId}`);
      }

      try {
        await db.run(
          `
          INSERT INTO pickem_games (
            id, game_name, type, commissioner_id, season_id, is_active
          ) VALUES (?, ?, ?, ?, ?, 1)
        `,
          [gameId, gameData.name, gameData.type, commissionerId, seasonId]
        );

        pickemGameIds.push(gameId);
        console.log(`   Created game: ${gameData.name}`);
      } catch (error) {
        console.error(`Failed to create game ${gameData.name}:`, error);
        console.error(
          `Commissioner ID: ${commissionerId}, Season ID: ${seasonId}`
        );
        throw error;
      }

      // Add participants to each game
      const participantCount = Math.floor(Math.random() * 4) + 4; // 4-7 participants
      const selectedUsers = userIds.slice(0, participantCount);

      for (const userId of selectedUsers) {
        const role = userId === commissionerId ? "owner" : "player";
        await db.run(
          `
          INSERT OR IGNORE INTO game_participants (
            id, game_id, user_id, role
          ) VALUES (?, ?, ?, ?)
        `,
          [uuidv4(), gameId, userId, role]
        );
      }

      console.log(`     Added ${participantCount} participants`);
    }
    console.log(`✅ Created ${pickemGames.length} pick'em games\n`);

    // 6. Generate picks for completed weeks
    console.log("🎯 Generating user picks...");
    let totalPicks = 0;

    for (let gameIndex = 0; gameIndex < pickemGameIds.length; gameIndex++) {
      const pickemGameId = pickemGameIds[gameIndex];

      // Get participants for this game
      const participants = await db.all(
        `
        SELECT user_id FROM game_participants WHERE game_id = ?
      `,
        [pickemGameId]
      );

      for (let userIndex = 0; userIndex < participants.length; userIndex++) {
        const userId = participants[userIndex].user_id;

        // Generate picks for weeks 1-8 (completed weeks)
        for (const weekData of testSchedule.slice(0, 8)) {
          const userPicks = generateUserPicks(
            userId,
            userIndex,
            weekData,
            teams,
            allNflGames
          );

          for (const pick of userPicks) {
            await db.run(
              `
              INSERT OR IGNORE INTO picks (
                id, user_id, game_id, season_id, week, nfl_game_id,
                pick_team_id, is_correct, tiebreaker
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
              [
                uuidv4(),
                pick.userId,
                pickemGameId,
                seasonId,
                pick.week,
                pick.nflGameId,
                pick.pickTeamId,
                pick.isCorrect,
                pick.tiebreaker,
              ]
            );
            totalPicks++;
          }
        }
      }
    }
    console.log(`✅ Generated ${totalPicks} user picks\n`);

    // 7. Create admin user if it doesn't exist
    console.log("👤 Ensuring admin user exists...");
    const adminEmail = "admin@nflpickem.com";
    const existingAdmin = await db.get("SELECT id FROM users WHERE email = ?", [
      adminEmail,
    ]);

    if (!existingAdmin) {
      const adminPassword = "admin123";
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      const adminId = uuidv4();

      await db.run(
        `
        INSERT INTO users (
          id, email, password, first_name, last_name, is_admin, email_verified
        ) VALUES (?, ?, ?, ?, ?, 1, 1)
      `,
        [adminId, adminEmail, hashedPassword, "Admin", "User"]
      );

      console.log("✅ Admin user created");
      console.log(`   Email: ${adminEmail}`);
      console.log(`   Password: ${adminPassword}`);
      console.log("   🚨 CHANGE THIS PASSWORD AFTER FIRST LOGIN!\n");
    } else {
      console.log("ℹ️  Admin user already exists\n");
    }

    // 8. Display summary
    const [userCount, teamCount, gameCount, nflGameCount, pickCount] =
      await Promise.all([
        db.get("SELECT COUNT(*) as count FROM users"),
        db.get("SELECT COUNT(*) as count FROM nfl_teams"),
        db.get("SELECT COUNT(*) as count FROM pickem_games"),
        db.get("SELECT COUNT(*) as count FROM nfl_games"),
        db.get("SELECT COUNT(*) as count FROM picks"),
      ]);

    console.log("📊 Test Database Summary:");
    console.log(`   Users: ${userCount.count}`);
    console.log(`   NFL Teams: ${teamCount.count}`);
    console.log(`   Pick'em Games: ${gameCount.count}`);
    console.log(`   NFL Games: ${nflGameCount.count}`);
    console.log(`   User Picks: ${pickCount.count}`);
    console.log(`   Current Week: ${CURRENT_WEEK}\n`);

    console.log("🎉 Test schedule setup complete!");
    console.log("\nTest Data Created:");
    console.log("• 8 test users with different picking skills");
    console.log("• 3 pick'em games (2 weekly, 1 survivor)");
    console.log("• 10 weeks of NFL games (8 completed, 2 upcoming)");
    console.log("• Realistic picks and scores for testing");
    console.log("\nTest User Credentials:");
    console.log("• All test users: password123");
    console.log("• Admin user: admin@nflpickem.com / admin123");
    console.log("\nNext steps:");
    console.log('1. Run "npm run dev" to start the application');
    console.log("2. Login with any test user to see picks and stats");
    console.log("3. Login as admin to manage games and seasons");
    console.log("4. Test the pick'em functionality!\n");
  } catch (error) {
    console.error("❌ Test schedule setup failed:", error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run setup
createTestSchedule();
