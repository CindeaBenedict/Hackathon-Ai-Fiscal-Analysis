import 'dart:convert';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

void main() {
  runApp(const SupplyChainApp());
}

class SupplyChainApp extends StatelessWidget {
  const SupplyChainApp({super.key});

  @override
  Widget build(BuildContext context) {
    final baseTheme = ThemeData.dark(useMaterial3: true);
    return MaterialApp(
      title: 'Supply Chain Ops Console',
      theme: baseTheme.copyWith(
        scaffoldBackgroundColor: const Color(0xFF0D1310),
        colorScheme: baseTheme.colorScheme.copyWith(
          primary: const Color(0xFF94A364),
          secondary: const Color(0xFF6C7A4B),
          surface: const Color(0xFF151D18),
        ),
        cardTheme: const CardThemeData(
          color: Color(0xFF151D18),
          margin: EdgeInsets.zero,
        ),
        textTheme: baseTheme.textTheme.apply(
          bodyColor: const Color(0xFFD7DFC7),
          displayColor: const Color(0xFFD7DFC7),
          fontFamily: 'monospace',
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFF1D2720),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: Color(0xFF41523A)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: Color(0xFF41523A)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: Color(0xFF94A364), width: 1.6),
          ),
        ),
      ),
      home: const SimulationScreen(),
    );
  }
}

class SimulationScreen extends StatefulWidget {
  const SimulationScreen({super.key});

  @override
  State<SimulationScreen> createState() => _SimulationScreenState();
}

class _SimulationScreenState extends State<SimulationScreen> {
  final _baseUrlController = TextEditingController(text: 'http://10.0.2.2:8000');
  final _customQtyController = TextEditingController(text: '120');
  final _simController = TextEditingController(text: '120');

  String _strategy = 'balanced';
  bool _loading = false;
  String _error = '';
  CompactResult? _result;

  @override
  void dispose() {
    _baseUrlController.dispose();
    _customQtyController.dispose();
    _simController.dispose();
    super.dispose();
  }

  Future<void> _runSimulation() async {
    final simulations = int.tryParse(_simController.text.trim()) ?? 100;
    final customQty = int.tryParse(_customQtyController.text.trim()) ?? 120;
    if (simulations < 1) {
      setState(() => _error = 'Simulations must be at least 1.');
      return;
    }

    setState(() {
      _loading = true;
      _error = '';
    });

    try {
      final uri = Uri.parse('${_baseUrlController.text.trim()}/simulate/compact');
      final payload = {
        'strategy': _strategy,
        'order_quantity': _strategy == 'custom' ? customQty : null,
        'simulations': simulations,
      };
      final response = await http.post(
        uri,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      );

      if (response.statusCode >= 400) {
        throw Exception('API error ${response.statusCode}: ${response.body}');
      }

      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      setState(() => _result = CompactResult.fromJson(decoded));
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('TACTICAL SUPPLY CHAIN CONSOLE'),
        backgroundColor: const Color(0xFF101812),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            _buildControls(),
            const SizedBox(height: 12),
            if (_error.isNotEmpty) _buildErrorCard(),
            if (_result != null) ...[
              _buildMetrics(_result!),
              const SizedBox(height: 12),
              _buildInventoryChart(_result!),
              const SizedBox(height: 12),
              _buildProfitHistogram(_result!),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildControls() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Mission Controls', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 10),
            TextField(
              controller: _baseUrlController,
              decoration: const InputDecoration(
                labelText: 'Backend URL',
                hintText: 'http://10.0.2.2:8000',
              ),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              value: _strategy,
              items: const [
                DropdownMenuItem(value: 'conservative', child: Text('Conservative (150)')),
                DropdownMenuItem(value: 'balanced', child: Text('Balanced (120)')),
                DropdownMenuItem(value: 'aggressive', child: Text('Aggressive (100)')),
                DropdownMenuItem(value: 'custom', child: Text('Custom')),
              ],
              onChanged: (value) {
                if (value != null) {
                  setState(() => _strategy = value);
                }
              },
              decoration: const InputDecoration(labelText: 'Policy'),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _simController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Simulations'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _customQtyController,
                    keyboardType: TextInputType.number,
                    enabled: _strategy == 'custom',
                    decoration: const InputDecoration(labelText: 'Custom order qty'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _loading ? null : _runSimulation,
                child: Text(_loading ? 'Running...' : 'Run Simulation'),
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Tip: for physical phone use your laptop local IP, not 127.0.0.1.',
              style: TextStyle(fontSize: 12, color: Color(0xFF9EB08E)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorCard() {
    return Card(
      color: const Color(0xFF2E1B1B),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Text(_error, style: const TextStyle(color: Color(0xFFFFB4B4))),
      ),
    );
  }

  Widget _buildMetrics(CompactResult r) {
    Widget metric(String label, String value) {
      return Expanded(
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFF41523A)),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFF9EB08E))),
              const SizedBox(height: 6),
              Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
            ],
          ),
        ),
      );
    }

    String money(double v) => '\$${v.toStringAsFixed(0)}';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Operational Snapshot', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Row(children: [metric('Avg Profit', money(r.avgProfit)), const SizedBox(width: 8), metric('Worst Case', money(r.worstProfit))]),
            const SizedBox(height: 8),
            Row(children: [metric('Best Case', money(r.bestProfit)), const SizedBox(width: 8), metric('Bankruptcy Prob.', '${(r.bankruptcyProbability * 100).toStringAsFixed(1)}%')]),
            const SizedBox(height: 8),
            Row(children: [metric('P10 Profit', money(r.profitP10)), const SizedBox(width: 8), metric('P90 Profit', money(r.profitP90))]),
          ],
        ),
      ),
    );
  }

  Widget _buildInventoryChart(CompactResult r) {
    final spots = <FlSpot>[];
    for (var i = 0; i < r.avgInventoryTrace.length; i++) {
      spots.add(FlSpot(i.toDouble(), r.avgInventoryTrace[i]));
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Average Inventory by Week', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 10),
            SizedBox(
              height: 220,
              child: LineChart(
                LineChartData(
                  gridData: const FlGridData(show: true),
                  borderData: FlBorderData(show: true),
                  titlesData: const FlTitlesData(
                    topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  ),
                  lineBarsData: [
                    LineChartBarData(
                      spots: spots,
                      isCurved: true,
                      barWidth: 2.2,
                      color: const Color(0xFFB2C87C),
                      dotData: const FlDotData(show: false),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProfitHistogram(CompactResult r) {
    final bars = <BarChartGroupData>[];
    for (var i = 0; i < r.profitHistogramBins.length; i++) {
      bars.add(
        BarChartGroupData(
          x: i,
          barRods: [
            BarChartRodData(
              toY: r.profitHistogramBins[i].toDouble(),
              color: const Color(0xFF7E9555),
              width: 14,
            ),
          ],
        ),
      );
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Profit Distribution (Histogram)', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 10),
            SizedBox(
              height: 220,
              child: BarChart(
                BarChartData(
                  gridData: const FlGridData(show: true),
                  borderData: FlBorderData(show: true),
                  titlesData: const FlTitlesData(
                    topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  ),
                  barGroups: bars,
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Median: \$${r.profitP50.toStringAsFixed(0)} | Avg stockouts: ${r.stockoutsAverage.toStringAsFixed(2)}',
              style: const TextStyle(color: Color(0xFF9EB08E), fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}

class CompactResult {
  CompactResult({
    required this.avgProfit,
    required this.bestProfit,
    required this.worstProfit,
    required this.stockoutsAverage,
    required this.bankruptcyProbability,
    required this.profitP10,
    required this.profitP50,
    required this.profitP90,
    required this.avgInventoryTrace,
    required this.profitHistogramBins,
  });

  final double avgProfit;
  final double bestProfit;
  final double worstProfit;
  final double stockoutsAverage;
  final double bankruptcyProbability;
  final double profitP10;
  final double profitP50;
  final double profitP90;
  final List<double> avgInventoryTrace;
  final List<int> profitHistogramBins;

  factory CompactResult.fromJson(Map<String, dynamic> json) {
    return CompactResult(
      avgProfit: (json['avg_profit'] as num).toDouble(),
      bestProfit: (json['best_profit'] as num).toDouble(),
      worstProfit: (json['worst_profit'] as num).toDouble(),
      stockoutsAverage: (json['stockouts_average'] as num).toDouble(),
      bankruptcyProbability: (json['bankruptcy_probability'] as num).toDouble(),
      profitP10: (json['profit_p10'] as num).toDouble(),
      profitP50: (json['profit_p50'] as num).toDouble(),
      profitP90: (json['profit_p90'] as num).toDouble(),
      avgInventoryTrace: (json['avg_inventory_trace'] as List<dynamic>)
          .map((e) => (e as num).toDouble())
          .toList(),
      profitHistogramBins: (json['profit_histogram_bins'] as List<dynamic>)
          .map((e) => (e as num).toInt())
          .toList(),
    );
  }
}
