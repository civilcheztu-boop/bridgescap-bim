"""
BridgeSCAP-BIM: Sistema Digital de Inspección y Gestión de Puentes SCAP & Pre-BIM
Tesis: Propuesta de Mantenimiento Integral del Puente Luis Miguel Sánchez Cerro sustentada en la Evaluación Técnica mediante la Metodología SCAP, Piura 2026.
Autor: Br. Christian Ivan Vilchez Tume
"""

import os
import sqlite3
import json
import base64
from datetime import datetime
from flask import Flask, request, jsonify, render_template, send_from_directory

app = Flask(__name__, static_folder='static', template_folder='templates')

# En Render la BD vive en /tmp (escritura permitida). Localmente usa la carpeta del proyecto.
if os.environ.get('RENDER'):
    DB_FILE = '/tmp/scap_database.db'
    UPLOAD_DIR = '/tmp/uploads'
else:
    DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scap_database.db')
    UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')

os.makedirs(UPLOAD_DIR, exist_ok=True)

# Lista maestra de elementos estructurales del Puente Sánchez Cerro
# (Basado en la caracterización de la tesis: 3 tramos, 111.4 m, Viga-Losa Acero/Concreto, Pilares Caisson)
DEFAULT_COMPONENTS = [
    # SUPERESTRUCTURA
    {"code": "SUP-VIG-T1", "name": "Vigas Principales de Acero (Tramo 1)", "group": "Superestructura", "ifc": "IfcBeam", "importance": 1.20, "length": 37.13, "width": 1.80, "thickness": 0.03, "unit": "m3"},
    {"code": "SUP-VIG-T2", "name": "Vigas Principales de Acero (Tramo 2)", "group": "Superestructura", "ifc": "IfcBeam", "importance": 1.20, "length": 37.14, "width": 1.80, "thickness": 0.03, "unit": "m3"},
    {"code": "SUP-VIG-T3", "name": "Vigas Principales de Acero (Tramo 3)", "group": "Superestructura", "ifc": "IfcBeam", "importance": 1.20, "length": 37.13, "width": 1.80, "thickness": 0.03, "unit": "m3"},
    {"code": "SUP-LOS-T1", "name": "Tablero / Losa de Concreto Armado (Tramo 1)", "group": "Superestructura", "ifc": "IfcSlab", "importance": 1.15, "length": 37.13, "width": 14.50, "thickness": 0.22, "unit": "m3"},
    {"code": "SUP-LOS-T2", "name": "Tablero / Losa de Concreto Armado (Tramo 2)", "group": "Superestructura", "ifc": "IfcSlab", "importance": 1.15, "length": 37.14, "width": 14.50, "thickness": 0.22, "unit": "m3"},
    {"code": "SUP-LOS-T3", "name": "Tablero / Losa de Concreto Armado (Tramo 3)", "group": "Superestructura", "ifc": "IfcSlab", "importance": 1.15, "length": 37.13, "width": 14.50, "thickness": 0.22, "unit": "m3"},
    {"code": "SUP-DIA-ALL", "name": "Diafragmas y Arriostres Metálicos", "group": "Superestructura", "ifc": "IfcMember", "importance": 1.00, "length": 14.50, "width": 1.50, "thickness": 0.02, "unit": "m3"},
    {"code": "SUP-APO-ALL", "name": "Dispositivos de Apoyo (Neopreno)", "group": "Superestructura", "ifc": "IfcBearing", "importance": 1.10, "length": 0.60, "width": 0.60, "thickness": 0.12, "unit": "m3"},
    {"code": "SUP-JUN-ALL", "name": "Juntas de Dilatación / Expansión", "group": "Superestructura", "ifc": "IfcBuildingElementProxy", "importance": 0.90, "length": 14.50, "width": 0.30, "thickness": 0.10, "unit": "m3"},
    
    # SUBESTRUCTURA
    {"code": "SUB-EST-IZQ", "name": "Estribo Margen Izquierda (Piura)", "group": "Subestructura", "ifc": "IfcWall", "importance": 1.25, "length": 15.00, "width": 2.50, "thickness": 6.50, "unit": "m3"},
    {"code": "SUB-EST-DER", "name": "Estribo Margen Derecha (Castilla)", "group": "Subestructura", "ifc": "IfcWall", "importance": 1.25, "length": 15.00, "width": 2.50, "thickness": 6.50, "unit": "m3"},
    {"code": "SUB-PIL-P01", "name": "Pilar Central 01 (Cajón de Concreto)", "group": "Subestructura", "ifc": "IfcColumn", "importance": 1.30, "length": 14.50, "width": 3.00, "thickness": 7.50, "unit": "m3"},
    {"code": "SUB-PIL-P02", "name": "Pilar Central 02 (Cajón de Concreto)", "group": "Subestructura", "ifc": "IfcColumn", "importance": 1.30, "length": 14.50, "width": 3.00, "thickness": 7.50, "unit": "m3"},
    {"code": "SUB-CAI-ALL", "name": "Cimentación Profunda (Cajones Caisson)", "group": "Subestructura", "ifc": "IfcFooting", "importance": 1.30, "length": 16.00, "width": 4.50, "thickness": 12.00, "unit": "m3"},
    
    # ELEMENTOS COMPLEMENTARIOS
    {"code": "COM-PAV-ALL", "name": "Capa de Rodadura Asfáltica / Calzada", "group": "Complementarios", "ifc": "IfcCovering", "importance": 0.70, "length": 111.40, "width": 12.00, "thickness": 0.05, "unit": "m3"},
    {"code": "COM-BAR-ALL", "name": "Barandas Metálicas y Defensas", "group": "Complementarios", "ifc": "IfcRailing", "importance": 0.60, "length": 222.80, "width": 0.20, "thickness": 1.10, "unit": "m3"},
    {"code": "COM-DRE-ALL", "name": "Sistema de Drenaje y Tubos de Bajada", "group": "Complementarios", "ifc": "IfcDistributionFlowElement", "importance": 0.65, "length": 111.40, "width": 0.20, "thickness": 0.20, "unit": "m3"}
]

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS inspections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            component_code TEXT UNIQUE NOT NULL,
            component_name TEXT NOT NULL,
            element_group TEXT NOT NULL,
            ifc_class TEXT NOT NULL,
            evaluator TEXT NOT NULL,
            date_time TEXT NOT NULL,
            bridge_name TEXT NOT NULL,
            district TEXT NOT NULL,
            province TEXT NOT NULL,
            bridge_type TEXT NOT NULL,
            length_total REAL NOT NULL,
            spans INTEGER NOT NULL,
            composition TEXT NOT NULL,
            construction_year INTEGER NOT NULL,
            element_length REAL DEFAULT 0,
            element_width REAL DEFAULT 0,
            element_thickness REAL DEFAULT 0,
            element_volume REAL DEFAULT 0,
            unit TEXT DEFAULT 'm3',
            pathologies_json TEXT DEFAULT '[]',
            affected_vol REAL DEFAULT 0,
            unaffected_vol REAL DEFAULT 0,
            pct_affected REAL DEFAULT 0,
            pct_unaffected REAL DEFAULT 100,
            condition_stat REAL DEFAULT 0,
            importance_factor REAL DEFAULT 1.0,
            bridge_contribution REAL DEFAULT 0,
            photo_data TEXT DEFAULT '',
            photo_description TEXT DEFAULT '',
            comments TEXT DEFAULT '',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    
    # Insertar componentes predeterminados si la tabla está vacía
    cursor.execute("SELECT COUNT(*) FROM inspections")
    if cursor.fetchone()[0] == 0:
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        for comp in DEFAULT_COMPONENTS:
            vol = round(comp["length"] * comp["width"] * comp["thickness"], 3)
            cursor.execute("""
                INSERT INTO inspections (
                    component_code, component_name, element_group, ifc_class,
                    evaluator, date_time, bridge_name, district, province,
                    bridge_type, length_total, spans, composition, construction_year,
                    element_length, element_width, element_thickness, element_volume, unit,
                    pathologies_json, affected_vol, unaffected_vol, pct_affected, pct_unaffected,
                    condition_stat, importance_factor, bridge_contribution,
                    photo_data, photo_description, comments
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                comp["code"], comp["name"], comp["group"], comp["ifc"],
                "Br. Christian Ivan Vilchez Tume", now_str,
                "Puente Luis Miguel Sánchez Cerro", "Piura - Castilla", "Piura",
                "Viga - Losa", 111.4, 3, "Concreto - Acero", 2000,
                comp["length"], comp["width"], comp["thickness"], vol, comp["unit"],
                "[]", 0.0, vol, 0.0, 100.0,
                0.0, comp["importance"], 0.0,
                "", "", "Componente sin inspección registrada."
            ))
        conn.commit()
    conn.close()

# Inicializar BD al arrancar
init_db()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/components', methods=['GET'])
def get_components():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM inspections ORDER BY element_group DESC, component_code ASC")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(rows)

@app.route('/api/components/<code_id>', methods=['GET'])
def get_component_detail(code_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM inspections WHERE component_code = ?", (code_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        data = dict(row)
        try:
            data['pathologies'] = json.loads(data.get('pathologies_json') or '[]')
        except:
            data['pathologies'] = []
        return jsonify(data)
    return jsonify({"error": "No encontrado"}), 404

@app.route('/api/components/<code_id>', methods=['POST'])
def save_inspection(code_id):
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    
    # Cálculos SCAP
    el_length = float(data.get('element_length') or 0)
    el_width = float(data.get('element_width') or 0)
    el_thick = float(data.get('element_thickness') or 0)
    total_vol = round(el_length * el_width * el_thick, 3)
    if total_vol <= 0:
        total_vol = float(data.get('element_volume') or 1.0)
    
    pathologies = data.get('pathologies', [])
    
    # Calcular volumen afectado ponderado por severidad según SCAP
    # Grados: 0=Muy Bueno (0), 1=Bueno (1), 2=Regular (2), 3=Malo (3), 4=Muy Malo (4), 5=Pésimo (5)
    total_affected_vol = 0.0
    weighted_damage_sum = 0.0
    
    for p in pathologies:
        sev = float(p.get('severity', 0))
        p_l = float(p.get('length', 0))
        p_w = float(p.get('width', 0))
        p_t = float(p.get('thickness', 0))
        p_vol = float(p.get('volume', 0))
        if p_vol <= 0 and (p_l * p_w * p_t > 0):
            p_vol = round(p_l * p_w * p_t, 3)
            p['volume'] = p_vol
            
        if sev > 0 and p_vol > 0:
            total_affected_vol += p_vol
            weighted_damage_sum += (sev * p_vol)
            
    pct_affected = round((total_affected_vol / total_vol) * 100, 2) if total_vol > 0 else 0
    if pct_affected > 100: pct_affected = 100.0
    pct_unaffected = round(100.0 - pct_affected, 2)
    unaffected_vol = round(max(0.0, total_vol - total_affected_vol), 3)
    
    # Condición Estadística SCAP (0 a 5)
    # Si no hay daño, la condición es 0.0 (Excelente / Muy Bueno)
    if total_vol > 0:
        # Condición ponderada: (daño ponderado + 0 * vol_no_afectado) / vol_total
        condition_stat = round(weighted_damage_sum / total_vol, 2)
    else:
        condition_stat = 0.0
        
    imp_factor = float(data.get('importance_factor') or 1.0)
    bridge_contribution = round(condition_stat * imp_factor, 3)
    
    cursor.execute("""
        UPDATE inspections SET
            evaluator = ?,
            date_time = ?,
            element_length = ?,
            element_width = ?,
            element_thickness = ?,
            element_volume = ?,
            pathologies_json = ?,
            affected_vol = ?,
            unaffected_vol = ?,
            pct_affected = ?,
            pct_unaffected = ?,
            condition_stat = ?,
            importance_factor = ?,
            bridge_contribution = ?,
            photo_data = ?,
            photo_description = ?,
            comments = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE component_code = ?
    """, (
        data.get('evaluator', 'Br. Christian Ivan Vilchez Tume'),
        data.get('date_time', datetime.now().strftime("%Y-%m-%d %H:%M")),
        el_length, el_width, el_thick, total_vol,
        json.dumps(pathologies),
        total_affected_vol, unaffected_vol,
        pct_affected, pct_unaffected,
        condition_stat, imp_factor, bridge_contribution,
        data.get('photo_data', ''),
        data.get('photo_description', ''),
        data.get('comments', ''),
        code_id
    ))
    conn.commit()
    conn.close()
    
    return jsonify({
        "status": "success",
        "component_code": code_id,
        "total_vol": total_vol,
        "affected_vol": total_affected_vol,
        "unaffected_vol": unaffected_vol,
        "pct_affected": pct_affected,
        "pct_unaffected": pct_unaffected,
        "condition_stat": condition_stat,
        "importance_factor": imp_factor,
        "bridge_contribution": bridge_contribution
    })

@app.route('/api/summary', methods=['GET'])
def get_global_summary():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM inspections")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    total_components = len(rows)
    inspected_components = [r for r in rows if r['condition_stat'] > 0 or len(r['photo_data']) > 0 or r['comments'] != 'Componente sin inspección registrada.']
    
    sum_contributions = sum(r['bridge_contribution'] for r in rows)
    sum_importances = sum(r['importance_factor'] for r in rows)
    
    # Índice Global de Condición del Puente (escala SCAP 0 a 5)
    global_scap_index = round(sum_contributions / sum_importances, 2) if sum_importances > 0 else 0.0
    
    # Calificación cualitativa según MTC / Metodología SCAP
    # 0.00 - 0.99 : Muy Bueno / Excelente (Mantenimiento Rutinario)
    # 1.00 - 1.99 : Bueno (Mantenimiento Preventivo Menor)
    # 2.00 - 2.99 : Regular (Mantenimiento Periódico / Reparación Moderada)
    # 3.00 - 3.99 : Malo / Preocupante (Reparación Mayor Urgente)
    # 4.00 - 5.00 : Pésimo / Crítico (Rehabilitación Inmediata / Cierre)
    if global_scap_index < 1.0:
        qualitative_status = "Muy Bueno / Excelente"
        priority = "Mantenimiento Rutinario"
        status_color = "#10b981" # green
    elif global_scap_index < 2.0:
        qualitative_status = "Bueno"
        priority = "Mantenimiento Preventivo Menor"
        status_color = "#3b82f6" # blue
    elif global_scap_index < 3.0:
        qualitative_status = "Regular"
        priority = "Mantenimiento Periódico / Reparación Moderada"
        status_color = "#f59e0b" # amber
    elif global_scap_index < 4.0:
        qualitative_status = "Malo / Preocupante"
        priority = "Reparación Urgente / Reforzamiento"
        status_color = "#ef4444" # red
    else:
        qualitative_status = "Pésimo / Crítico"
        priority = "Intervención Inmediata / Riesgo Estructural"
        status_color = "#7f1d1d" # dark red
        
    return jsonify({
        "total_components": total_components,
        "inspected_count": len(inspected_components),
        "global_scap_index": global_scap_index,
        "qualitative_status": qualitative_status,
        "maintenance_priority": priority,
        "status_color": status_color,
        "bridge_name": "Puente Luis Miguel Sánchez Cerro",
        "components": rows
    })

@app.route('/api/export/bim', methods=['GET'])
def export_bim_dataset():
    """Exporta el dataset completo formateado para integración con BIM (Revit/IFC) y BCF"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM inspections")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    bim_elements = []
    for r in rows:
        bim_elements.append({
            "ElementCode": r["component_code"],
            "ElementName": r["component_name"],
            "ElementGroup": r["element_group"],
            "IfcEntity": r["ifc_class"],
            "Dimensions": {
                "Length_m": r["element_length"],
                "Width_m": r["element_width"],
                "Thickness_m": r["element_thickness"],
                "Volume_m3": r["element_volume"]
            },
            "Pset_SCAP_Maintenance": {
                "Evaluator": r["evaluator"],
                "EvaluationDate": r["date_time"],
                "ConditionStatistic": r["condition_stat"],
                "ImportanceFactor": r["importance_factor"],
                "BridgeContribution": r["bridge_contribution"],
                "AffectedPercentage": r["pct_affected"],
                "UnaffectedPercentage": r["pct_unaffected"],
                "DamageSeverityLabel": "Muy Bueno" if r["condition_stat"] < 1 else ("Bueno" if r["condition_stat"] < 2 else ("Regular" if r["condition_stat"] < 3 else ("Malo" if r["condition_stat"] < 4 else "Pésimo")))
            },
            "HasInspectionPhoto": bool(r["photo_data"]),
            "TechnicalNotes": r["comments"]
        })
        
    return jsonify({
        "project": "Tesis UNP - Mantenimiento Integral Puente Sánchez Cerro",
        "author": "Br. Christian Ivan Vilchez Tume",
        "bim_standard": "IFC4 / BrIM (Bridge Information Modeling)",
        "generated_at": datetime.now().isoformat(),
        "elements_count": len(bim_elements),
        "elements": bim_elements
    })

@app.route('/api/maintenance-plan', methods=['GET'])
def get_maintenance_plan():
    """
    Genera la Propuesta de Mantenimiento Integral del Puente Sánchez Cerro
    Sustentada en la evaluación técnica SCAP (MTC)
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM inspections")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()

    actions = []
    budget_items = []
    item_counter = 1

    # Catálogo de actividades según severidad SCAP y componente
    for r in rows:
        code = r["component_code"]
        name = r["component_name"]
        grp = r["element_group"]
        score = float(r["condition_stat"] or 0)
        vol = float(r["element_volume"] or 1)
        l = float(r["element_length"] or 0)
        w = float(r["element_width"] or 0)
        t = float(r["element_thickness"] or 0)

        # Reglas técnicas de mantenimiento MTC
        if "VIG" in code:
            # Vigas de acero
            area_metal = round(l * 1.80 * 2 * 1.25, 2) # Área aprox perfiles I en m2
            if score < 1.0:
                act = "Inspección rutinaria visual y limpieza de polvo/sales acumuladas."
                tipo = "Rutinario"
                freq = "Semestral"
                spec = "Manual de Carreteras - Mantenimiento o Conservación Vial MTC"
                partida = "Limpieza y lavado de estructuras metálicas a presión"
                und = "m2"
                metrado = area_metal
                pu = 12.50
            elif score < 2.5:
                act = "Limpieza con chorro de agua a presión y retoque localizado de pintura anticorrosiva rica en zinc en zonas con óxido inicial."
                tipo = "Preventivo Menor"
                freq = "Anual"
                spec = "MTC EG-2013 Sección 804 / SSPC-SP 3"
                partida = "Pintura protectora anticorrosiva y poliuretano en vigas de acero"
                und = "m2"
                metrado = round(area_metal * max(0.15, r["pct_affected"]/100), 2)
                pu = 45.00
            else:
                act = "Limpieza por chorro abrasivo a metal casi blanco (SSPC-SP 10) y aplicación de sistema tri-capa (Inorgánico de Zinc + Epóxico + Poliuretano alifático)."
                tipo = "Correctivo / Mayor"
                freq = "Inmediato (Año 1)"
                spec = "MTC EG-2013 Sección 804 / SSPC-SP 10"
                partida = "Arenado y repintado integral de vigas metálicas"
                und = "m2"
                metrado = area_metal
                pu = 95.00
        elif "LOS" in code:
            # Tablero de concreto armado
            area_losa = round(l * w, 2)
            if score < 1.0:
                act = "Limpieza de calzada, retiro de sedimentos y sellado de microfisuras superficiales no estructurales."
                tipo = "Rutinario"
                freq = "Trimestral"
                spec = "Manual de Conservación de Puentes MTC"
                partida = "Sellado de microfisuras capilares en losa con sellador elastomérico"
                und = "m"
                metrado = round(l * 4, 2)
                pu = 22.00
            elif score < 2.5:
                act = "Inyección a baja presión de resina epóxica de alta adherencia en fisuras y aplicación de recubrimiento hidrófugo."
                tipo = "Preventivo / Moderado"
                freq = "Bienal"
                spec = "ACI 224.1R / MTC EG-2013 Sección 505"
                partida = "Inyección de resina epóxica en grietas de tablero"
                und = "m"
                metrado = round(l * 8, 2)
                pu = 75.00
            else:
                act = "Picado de concreto degradado, pasivación de acero de refuerzo con inhibidor de corrosión y reposición con mortero estructural tixotrópico clase R4."
                tipo = "Reparación Estructural"
                freq = "Inmediato (Año 1)"
                spec = "EN 1504-3 / MTC EG-2013"
                partida = "Reparación estructural con mortero tixotrópico R4"
                und = "m3"
                metrado = round(max(0.5, r["affected_vol"]), 2)
                pu = 2800.00
        elif "APO" in code:
            # Apoyos de neopreno
            if score < 2.0:
                act = "Limpieza de placas de apoyo, retiro de detritos y verificación de distorsiones angulares."
                tipo = "Preventivo"
                freq = "Semestral"
                spec = "AASHTO LRFD M251 / Manual de Puentes MTC"
                partida = "Mantenimiento, limpieza y lubricación de apoyos elastoméricos"
                und = "und"
                metrado = 16.0
                pu = 180.00
            else:
                act = "Izaje controlado de superestructura mediante gatos hidráulicos y reemplazo de dispositivos de apoyo elastoméricos zunchados."
                tipo = "Correctivo Mayor"
                freq = "Programado (Año 1-2)"
                spec = "AASHTO M251 / MTC EG-2013 Sección 508"
                partida = "Izaje de puente y sustitución de apoyos de neopreno"
                und = "und"
                metrado = 8.0
                pu = 3500.00
        elif "JUN" in code:
            # Juntas de dilatación
            if score < 2.0:
                act = "Limpieza profunda de ranuras de junta, retiro de piedras y reposición de sellante elastomérico de poliuretano."
                tipo = "Preventivo"
                freq = "Semestral"
                spec = "MTC EG-2013 Sección 507"
                partida = "Limpieza y sellado de juntas de dilatación con poliuretano"
                und = "m"
                metrado = round(14.5 * 2, 2)
                pu = 65.00
            else:
                act = "Desmontaje de perfiles metálicos dañados y reemplazo de juntas de expansión tipo dentada o perfil elastomérico con placa de anclaje."
                tipo = "Correctivo"
                freq = "Inmediato (Año 1)"
                spec = "MTC EG-2013 Sección 507"
                partida = "Reemplazo de conjunto de junta de dilatación de elastómero"
                und = "m"
                metrado = round(14.5 * 2, 2)
                pu = 420.00
        elif "PIL" in code or "EST" in code or "CAI" in code:
            # Subestructura (Pilares, Estribos, Caissons)
            if score < 1.5:
                act = "Monitoreo batimétrico post-crecida del Río Piura, descolmatación de escombros vegetales y sellado de porosidad."
                tipo = "Rutinario / Predictivo"
                freq = "Semestral (Pre y Post Crecida)"
                spec = "Manual de Hidrología, Hidráulica y Drenaje MTC"
                partida = "Descolmatación y retiro de palizada en fustes de pilares"
                und = "glb"
                metrado = 1.0
                pu = 4500.00
            elif score < 3.0:
                act = "Tratamiento de eflorescencias superficiales, sellado impermeable de fisuras por retracción y colocación de testigos de socavación."
                tipo = "Preventivo / Mitigación"
                freq = "Anual"
                spec = "MTC EG-2013 Sección 505"
                partida = "Sellado impermeabilizante y protección superficial de pilares"
                und = "m2"
                metrado = 120.0
                pu = 38.00
            else:
                act = "Encamisetado de concreto armado o protección de estribos/pilares mediante enrocado de escollera para control de socavación local."
                tipo = "Reforzamiento / Protección"
                freq = "Inmediato (Año 1)"
                spec = "Manual de Puentes MTC / ACI 318"
                partida = "Protección con enrocado y reparación de subestructura"
                und = "m3"
                metrado = 45.0
                pu = 220.00
        elif "PAV" in code:
            # Capa de rodadura
            if score < 2.0:
                act = "Limpieza de calzada y sellado de fisuras en asfalto con emulsión asfáltica modificada."
                tipo = "Rutinario"
                freq = "Semestral"
                spec = "MTC EG-2013 Sección 400"
                partida = "Sellado de grietas en pavimento asfáltico"
                und = "m"
                metrado = 150.0
                pu = 18.00
            else:
                act = "Fresado de carpeta asfáltica deteriorada y recapeo asfáltico en caliente e = 2\" con aditivo polimérico."
                tipo = "Periódico"
                freq = "Programado (Año 2)"
                spec = "MTC EG-2013 Sección 410"
                partida = "Recapeo de carpeta asfáltica en caliente e = 2\""
                und = "m2"
                metrado = round(111.4 * 12.0, 2)
                pu = 68.00
        elif "DRE" in code:
            # Drenaje
            act = "Desobstrucción manual y sopleteado de sumideros y tubos de bajada de PVC/acero galvanizado."
            tipo = "Rutinario / Preventivo"
            freq = "Trimestral"
            spec = "Manual de Conservación de Puentes MTC"
            partida = "Limpieza y descolmatación de tuberías de drenaje pluvial"
            und = "und"
            metrado = 24.0
            pu = 45.00
        elif "BAR" in code:
            # Barandas
            act = "Alineamiento, ajuste de pernos de anclaje, lijado de óxido y pintado con esmalte de alta visibilidad."
            tipo = "Preventivo"
            freq = "Anual"
            spec = "MTC EG-2013 Sección 804"
            partida = "Pintura y mantenimiento de barandas metálicas de protección"
            und = "m"
            metrado = 222.8
            pu = 32.00
        else:
            # Diafragmas y otros
            act = "Inspección de pernos de alta resistencia y retoque anticorrosivo en conexiones."
            tipo = "Preventivo"
            freq = "Anual"
            spec = "MTC EG-2013 Sección 804"
            partida = "Mantenimiento y torqueado de pernos en diafragmas metálicos"
            und = "glb"
            metrado = 1.0
            pu = 2500.00

        total_partida = round(metrado * pu, 2)

        actions.append({
            "code": code,
            "name": name,
            "group": grp,
            "score": score,
            "condition_label": "Muy Bueno" if score < 1 else ("Bueno" if score < 2 else ("Regular" if score < 3 else ("Malo" if score < 4 else "Pésimo"))),
            "action_text": act,
            "action_type": tipo,
            "frequency": freq,
            "specification": spec
        })

        budget_items.append({
            "item_number": f"0{item_counter}.00" if item_counter < 10 else f"{item_counter}.00",
            "component_code": code,
            "component_name": name,
            "description": partida,
            "unit": und,
            "quantity": metrado,
            "unit_price": pu,
            "total_price": total_partida,
            "action_type": tipo
        })
        item_counter += 1

    # Cálculos presupuestales
    costo_directo = round(sum(b["total_price"] for b in budget_items), 2)
    gastos_generales = round(costo_directo * 0.10, 2)  # 10%
    utilidad = round(costo_directo * 0.07, 2)          # 7%
    subtotal = round(costo_directo + gastos_generales + utilidad, 2)
    igv = round(subtotal * 0.18, 2)                     # 18%
    presupuesto_total = round(subtotal + igv, 2)

    return jsonify({
        "bridge_name": "Puente Luis Miguel Sánchez Cerro",
        "district": "Piura - Castilla",
        "evaluator": "Br. Christian Ivan Vilchez Tume",
        "thesis_year": "2026",
        "normative_framework": "Manual de Puentes MTC / Especificaciones Técnicas EG-2013 / Metodología SCAP",
        "actions": actions,
        "budget_items": budget_items,
        "cost_summary": {
            "costo_directo": costo_directo,
            "gastos_generales": gastos_generales,
            "utilidad": utilidad,
            "subtotal": subtotal,
            "igv": igv,
            "presupuesto_total": presupuesto_total
        }
    })


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("="*60)
    print("BridgeSCAP-BIM: Servidor iniciado con éxito")
    print(f"Accede desde tu navegador en: http://localhost:{port}")
    print("="*60)
    app.run(host='0.0.0.0', port=port, debug=False)
