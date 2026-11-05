import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Paleta blanca y azul inspirada en la identidad visual del SRI.
/// El sistema es independiente del organismo público.
class AppTheme {
  static const Color primary = Color(0xFF003B71);
  static const Color secondary = Color(0xFF0067B1);
  static const Color accent = Color(0xFF0072CE);
  static const Color background = Colors.white;
  static const Color danger = Color(0xFFC0392B);

  static ThemeData get theme {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: primary,
        primary: primary,
        secondary: secondary,
        surface: Colors.white,
      ),
      scaffoldBackgroundColor: background,
      appBarTheme: const AppBarTheme(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 1,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        margin: const EdgeInsets.symmetric(vertical: 6),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      ),
    );
  }
}

class Formatters {
  static final currency = NumberFormat.currency(locale: 'es_ES', symbol: r'$');
  static final date = DateFormat('dd/MM/yyyy');
  static final monthYear = DateFormat('MMMM yyyy', 'es');
}
