-- SOLO EJEMPLO: no es la programación ni los proyectos oficiales de ExpoTEC.
-- Ejecutar únicamente en un proyecto de desarrollo después de las migraciones.
begin;
insert into buildings(id,name,map_zone) values
 ('1','Iglesia','1'),('2','Oratorio','2'),('3','Escuela San Juan Bosco','3'),('4','Gimnasio','4'),
 ('5','Área técnica','5'),('6','Cancha verde','6'),('7','Patio','7'),('8','Centro infantil Pasitos Pequeños','8'),
 ('9','CRAI','9'),('10','Edificio A','10'),('11','Edificio B','11'),('12','Edificio C','12'),
 ('13','Mantenimiento','13'),('14','Comedor','14'),('15','Electromecánica','15'),
 ('16','Dibujo y Modelado de Edificaciones','16'),('17','TICs','17'),('18','Diseño Gráfico Multimedia','18'),('19','Mecánica de Precisión','19')
on conflict(id) do nothing;
insert into projects(id,building_id,name,description) values
 ('00000000-0000-4000-8000-000000000101','17','Proyecto de ejemplo · Tecnología que transforma','Sustituir por un proyecto real antes del evento.'),
 ('00000000-0000-4000-8000-000000000102','15','Proyecto de ejemplo · Energía en movimiento','Sustituir por un proyecto real antes del evento.')
on conflict(id) do nothing;
insert into challenges(id,building_id,project_id,title,description,kind,is_base,active,badge_key) values
 ('00000000-0000-4000-8000-000000000001','8',null,'Pequeñas ideas, grandes descubrimientos','Conoce un proyecto de Pasitos Pequeños y cuéntanos qué descubriste.','freeform',true,true,null),
 ('00000000-0000-4000-8000-000000000002','3',null,'La curiosidad empieza aquí','Visita la escuela y registra el proyecto que más llamó tu atención.','freeform',true,true,null),
 ('00000000-0000-4000-8000-000000000003','10',null,'Una idea para el futuro','Explora Tercer Ciclo. Ubicación de ejemplo por confirmar.','freeform',true,true,null),
 ('00000000-0000-4000-8000-000000000004','7',null,'Aliados del camino','Pide un código en el stand del patrocinador. Ubicación por confirmar.','code',true,true,null),
 ('00000000-0000-4000-8000-000000000005','7',null,'Un recuerdo de ExpoTEC','Visita el photobooth y solicita tu código. Ubicación por confirmar.','code',true,true,'moment'),
 ('00000000-0000-4000-8000-000000000006','17','00000000-0000-4000-8000-000000000101','Tecnología que transforma','Responde dos preguntas y solicita el código del stand.','quiz_code',false,true,null),
 ('00000000-0000-4000-8000-000000000007','11',null,'Historias en las paredes','Encuentra el santo. El edificio y la respuesta son ejemplos.','saint',false,true,null),
 ('00000000-0000-4000-8000-000000000008','12',null,'Historias en las paredes II','Encuentra el santo. El edificio y la respuesta son ejemplos.','saint',false,true,null)
on conflict(id) do nothing;
insert into quiz_questions(id,challenge_id,kind,prompt,options) values
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000006','objective','Ejemplo: ¿cuál es el objetivo de este proyecto?','["Ahorrar agua","Desperdiciar agua","Aumentar el ruido"]'),
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000006','technical','Ejemplo: ¿qué componente mide una variable del entorno?','["Un cartel","Un sensor","Una silla"]')
on conflict(id) do nothing;
insert into answer_keys(question_id,correct_index) values
 ('00000000-0000-4000-8000-000000000201',0),('00000000-0000-4000-8000-000000000202',1)
on conflict(question_id) do nothing;
insert into saint_keys(challenge_id,normalized_answer) values
 ('00000000-0000-4000-8000-000000000007','santo de ejemplo'),
 ('00000000-0000-4000-8000-000000000008','santo de ejemplo')
on conflict(challenge_id) do nothing;
commit;
